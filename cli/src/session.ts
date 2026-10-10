import path from "node:path";
import { ConvexClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { bridgeBackend } from "../../src/lib/protocol/bridge-backend";
import { randomId } from "../../src/lib/protocol/bytes";
import { joinTokenFor, joinTokenHash, newLinkSecret } from "../../src/lib/protocol/crypto";
import {
  RoomController,
  type Backend,
  type RoomState,
} from "../../src/lib/protocol/room-controller";
import type { SinkProvider } from "../../src/lib/protocol/types";
import { diskSinks, loadIdentity, nodePlatform, sourcesFrom } from "./node-platform";

/**
 * One transfer, driven by code.
 *
 * The terminal commands and the MCP server both sit on this file. A session opens a transfer
 * or joins one, reports what happens as plain events, and ends with a result.
 */

export type FerryEvent =
  | { event: "ready"; role: "host" | "guest"; room: string; link?: string; code?: string; files: Array<{ name: string; size: number }>; out_dir: string }
  | { event: "join_request"; device: string; device_id: string; security_code: string }
  | { event: "security_code"; code: string }
  | { event: "connected"; device: string; device_id: string }
  | { event: "progress"; direction: "out" | "in"; files_done: number; files_total: number; bytes: number; total_bytes: number; rate: number }
  | { event: "file_sent"; name: string; size: number }
  | { event: "file_saved"; name: string; path: string; size: number }
  | { event: "file_refused"; name: string; size: number; reason: string }
  | { event: "text"; from: string; text: string }
  | { event: "text_delivered"; text: string }
  | { event: "done"; ok: boolean; reason: EndReason; message: string; sent: number; received: number; failed: number; saved: string[] };

export type EndReason =
  | "complete"
  | "failed"
  | "timeout"
  | "stopped"
  | "missing"
  | "closed"
  | "expired"
  | "declined"
  | "full"
  | "bad-link"
  | "error";

/** Exit codes for the terminal commands. */
export const EXIT: Record<EndReason, number> = {
  complete: 0,
  failed: 1,
  timeout: 3,
  stopped: 130,
  missing: 4,
  closed: 4,
  expired: 4,
  declined: 4,
  full: 4,
  "bad-link": 4,
  error: 4,
};

const ENDINGS: Partial<Record<RoomState["phase"], string>> = {
  missing: "That transfer does not exist.",
  closed: "The other device ended the transfer.",
  expired: "That transfer has expired.",
  declined: "The other device did not let this device in.",
  full: "That transfer is full.",
  "bad-link": "That link is not valid. Copy it again from the other device.",
  error: "Could not open the transfer. Check the connection.",
};

export type Admit = "ask" | "link" | "any";

export type SessionOptions = {
  /** Files and folders to send. */
  paths?: string[];
  /** A text note to send. */
  text?: string;
  /** A 6-digit code or a link. When set, the session joins that transfer. Without it, the session opens a new one. */
  target?: string;
  /** Where received files are written. */
  outDir?: string;
  /** Refuse a received file larger than this many bytes. */
  maxBytes?: number;
  /** Stay open after the first exchange finishes. */
  keep?: boolean;
  /**
   * Who may join a transfer this session opened.
   * link: only a device that has the link. any: a device with the 6-digit code too.
   * ask: a device with the code raises a join_request, and decide() answers it.
   */
  admit?: Admit;
  /** End the session after this many milliseconds. */
  timeoutMs?: number;
  server?: string;
  site?: string;
  onEvent?: (event: FerryEvent) => void;
};

export class UsageError extends Error {}

function connect(server: string | undefined): { backend: Backend; close: () => void } {
  const bridge = process.env.FERRY_TEST_BRIDGE;
  if (bridge) return { backend: bridgeBackend(bridge), close: () => undefined };
  if (!server) throw new UsageError("No server is set. Pass --server <your Convex URL> or set FERRY_SERVER.");
  const client = new ConvexClient(server);
  return {
    backend: {
      mutation: (ref, args) => client.mutation(ref, args),
      action: (ref, args) => client.action(ref, args),
      subscribe: (ref, args, onValue, onError) => client.onUpdate(ref, args, onValue, onError),
    },
    close: () => void Promise.resolve(client.close()).catch(() => undefined),
  };
}

const settledStatus = ["done", "cancelled", "failed"];

export class Session {
  readonly result: Promise<Extract<FerryEvent, { event: "done" }>>;
  readonly events: FerryEvent[] = [];
  link: string | undefined;
  code: string | undefined;
  room = "";
  role: "host" | "guest" = "host";
  outDir = "";

  private controller!: RoomController;
  private closeBackend: () => void = () => undefined;
  private finish!: (done: Extract<FerryEvent, { event: "done" }>) => void;
  private ended = false;
  private saved: string[] = [];
  private refused = 0;
  private wanted = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private idle: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(event: FerryEvent) => void>();

  private constructor(private options: SessionOptions) {
    this.result = new Promise((resolve) => (this.finish = resolve));
    if (options.onEvent) this.listeners.add(options.onEvent);
  }

  static async open(options: SessionOptions): Promise<Session> {
    const session = new Session(options);
    await session.begin();
    return session;
  }

  on(listener: (event: FerryEvent) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit(event: FerryEvent) {
    this.events.push(event);
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
    for (const listener of this.listeners) listener(event);
  }

  get state(): RoomState {
    return this.controller.getState();
  }

  private async begin() {
    const { options } = this;
    const sources = options.paths?.length
      ? await sourcesFrom(options.paths).catch((error: Error) => {
          throw new UsageError(`Could not read ${error.message.split("'")[1] ?? "that path"}.`);
        })
      : [];
    if (options.paths?.length && sources.length === 0) throw new UsageError("There are no files in what you named.");
    this.wanted = sources.length;
    this.outDir = path.resolve(options.outDir ?? ".");

    const identity = await loadIdentity();
    const creds = { deviceId: identity.deviceId, deviceSecret: identity.deviceSecret };
    const { backend, close } = connect(options.server);
    this.closeBackend = close;
    await backend.mutation(api.devices.register, identity);

    let secret: string | null = null;
    if (options.target) {
      this.role = "guest";
      const digits = options.target.replace(/\s/g, "");
      if (/^\d{6}$/.test(digits)) {
        const found = await backend.mutation(api.rooms.lookupCode, { ...creds, code: digits });
        if (!found.roomId)
          throw new UsageError(
            found.limited
              ? "Too many tries. Wait a few minutes and try again."
              : "No transfer has that code. Check the six digits on the other device.",
          );
        this.room = found.roomId;
      } else {
        const match = options.target.match(/\/room\/([A-Za-z0-9_-]{16,64})(?:#k=([A-Za-z0-9_-]{40,64}))?/);
        if (!match) throw new UsageError("That is not a Ferry link or a 6-digit code.");
        this.room = match[1];
        secret = match[2] ?? null;
      }
    } else {
      const site = (options.site ?? "").replace(/\/$/, "");
      if (!site) throw new UsageError("No site address is set. Pass --site <your Ferry address> or set FERRY_SITE.");
      this.room = randomId(16);
      secret = newLinkSecret();
      const created = await backend.mutation(api.rooms.create, {
        ...creds,
        roomId: this.room,
        joinTokenHash: await joinTokenHash(await joinTokenFor(secret, this.room)),
        visible: false,
      });
      this.link = `${site}/room/${this.room}#k=${secret}`;
      this.code = created.code;
    }

    this.controller = new RoomController({
      backend,
      platform: nodePlatform(this.sinks()),
      identity,
      roomId: this.room,
      linkSecret: secret,
      via: this.role === "host" || secret ? "link" : "code",
    });
    this.watch();
    if (sources.length > 0) await this.controller.share(sources);
    this.controller.start();
    if (options.text) this.sendText(options.text, true);

    this.emit({
      event: "ready",
      role: this.role,
      room: this.room,
      link: this.link,
      code: this.code,
      files: sources.map((source) => ({ name: source.path ?? source.name, size: source.size })),
      out_dir: this.outDir,
    });
    if (options.timeoutMs && options.timeoutMs > 0) {
      const timer = setTimeout(
        () => void this.end("timeout", "The time limit passed before the transfer finished."),
        options.timeoutMs,
      );
      this.timers.add(timer);
    }
  }

  /** Files go to disk under outDir. A file over the size limit is refused before any of it is written. */
  private sinks(): SinkProvider {
    let lastSaved = "";
    const disk = diskSinks(this.outDir, (file) => (lastSaved = file));
    const limit = this.options.maxBytes;
    return {
      ...disk,
      open: async (peerId, meta) => {
        if (limit && meta.size > limit) {
          this.refused += 1;
          this.emit({ event: "file_refused", name: meta.path ?? meta.name, size: meta.size, reason: "The file is larger than the size limit." });
          throw new Error("too large");
        }
        return disk.open(peerId, meta);
      },
      complete: async (peerId, meta) => {
        await disk.complete(peerId, meta);
        this.saved.push(lastSaved);
        this.emit({ event: "file_saved", name: meta.path ?? meta.name, path: lastSaved, size: meta.size });
      },
    };
  }

  private pendingText: string[] = [];

  /** Send a text note. Before a device is connected the note waits, and goes when one connects. */
  sendText(text: string, required = false) {
    if (required) this.textsOwed += 1;
    if (!this.controller.sendNote(text)) this.pendingText.push(text);
  }

  private textsOwed = 0;
  private textsIn = 0;
  private sentFiles = 0;
  private textsDelivered = new Set<string>();

  /** Answer a join_request. */
  async decide(deviceId: string, allow: boolean) {
    await this.controller.decide(deviceId, allow);
  }

  async stop() {
    await this.end("stopped", "Stopped.");
  }

  private watch() {
    const { controller } = this;
    const asked = new Set<string>();
    const joined = new Set<string>();
    let shownCode = "";
    let lastProgress = "";

    controller.onEvent((event) => {
      if (event.type === "joined" && !joined.has(event.peerId)) {
        joined.add(event.peerId);
        this.emit({ event: "connected", device: event.name, device_id: event.peerId });
        for (const text of this.pendingText.splice(0)) if (!controller.sendNote(text)) this.pendingText.push(text);
      }
      if (event.type === "note" && event.note.direction === "in") {
        const from = this.state.peers.find((peer) => peer.id === event.note.peerId)?.name ?? "the other device";
        this.textsIn += 1;
        this.emit({ event: "text", from, text: event.note.text });
      }
      if (event.type === "sent") this.sentFiles += 1;
      if (event.type === "sent") this.emit({ event: "file_sent", name: event.meta.path ?? event.meta.name, size: event.meta.size });
    });

    controller.subscribe(() => {
      if (this.ended) return;
      const state = controller.getState();

      const ending = ENDINGS[state.phase];
      if (ending) {
        // The other device closing the transfer is the normal end once something has crossed.
        const exchanged = this.saved.length > 0 || this.sentCount() > 0 || this.textsIn > 0 || this.textsDelivered.size > 0;
        if (state.phase === "closed" && this.refused > 0) void this.end("failed", "A file was refused, so it was not transferred.");
        else if (state.phase === "closed" && exchanged) void this.end("complete", "The transfer is finished.");
        else void this.end(state.phase as EndReason, ending);
        return;
      }

      // A device that joined with the 6-digit code waits for a decision.
      for (const peer of state.peers) {
        if (peer.status !== "approval" || !peer.code) continue;
        const key = `${peer.id}:${peer.code}`;
        if (asked.has(key)) continue;
        asked.add(key);
        const admit = this.options.admit ?? "link";
        if (admit === "any") void controller.decide(peer.id, true).catch(() => undefined);
        else if (admit === "link") void controller.decide(peer.id, false).catch(() => undefined);
        else this.emit({ event: "join_request", device: peer.name, device_id: peer.id, security_code: peer.code });
      }

      // This device joined with a code and waits for the other side to confirm it.
      const own = state.peers[0]?.code;
      if (this.role === "guest" && state.phase === "approval" && own && own !== shownCode) {
        shownCode = own;
        this.emit({ event: "security_code", code: own });
      }

      for (const note of state.notes) {
        if (note.direction !== "out" || note.delivered === false || this.textsDelivered.has(note.id)) continue;
        this.textsDelivered.add(note.id);
        this.emit({ event: "text_delivered", text: note.text });
      }

      for (const direction of ["out", "in"] as const) {
        const list = state.transfers.filter((t) => t.direction === direction);
        if (list.length === 0) continue;
        const progress = {
          event: "progress" as const,
          direction,
          files_done: list.filter((t) => t.status === "done").length,
          files_total: list.length,
          bytes: list.reduce((sum, t) => sum + t.bytes, 0),
          total_bytes: list.reduce((sum, t) => sum + t.size, 0),
          rate: Math.round(list.reduce((sum, t) => sum + t.rate, 0)),
        };
        const key = `${direction}:${progress.files_done}:${Math.floor((progress.bytes / Math.max(progress.total_bytes, 1)) * 100)}`;
        if (key !== lastProgress) {
          lastProgress = key;
          this.emit(progress);
        }
      }

      this.checkFinished(state);
    });
  }

  private sentCount() {
    return this.sentFiles;
  }

  /**
   * A session is finished when everything it was asked to do has settled:
   * every file it sends has reached one device, every required text is delivered,
   * and nothing is still coming in. A session that sends nothing waits for files or text to arrive.
   */
  private checkFinished(state: RoomState) {
    if (this.options.keep || this.ended) return;
    const out = state.transfers.filter((t) => t.direction === "out");
    const incoming = state.transfers.filter((t) => t.direction === "in");
    const busy = [...out, ...incoming].some((t) => !settledStatus.includes(t.status));

    let sendingDone = true;
    if (this.wanted > 0) {
      const byPeer = new Map<string, typeof out>();
      for (const transfer of out) byPeer.set(transfer.peerId, [...(byPeer.get(transfer.peerId) ?? []), transfer]);
      sendingDone = [...byPeer.values()].some(
        (list) => list.length >= this.wanted && list.every((t) => settledStatus.includes(t.status)),
      );
    }
    const textDone = this.textsDelivered.size >= this.textsOwed && this.pendingText.length === 0;
    const sends = this.wanted > 0 || this.textsOwed > 0;
    // Counted here and not read from the state, because a device that leaves takes its rows with it.
    const receivedSomething = this.saved.length > 0 || this.refused > 0 || this.textsIn > 0 || incoming.length > 0;
    const complete = sends ? sendingDone && textDone && !busy : receivedSomething && !busy;

    if (!complete) {
      if (this.idle) clearTimeout(this.idle);
      this.idle = null;
      return;
    }
    // Wait a moment, because the other device may offer more files in the same batch.
    // State changes that leave the work complete do not restart the wait.
    if (this.idle) return;
    this.idle = setTimeout(() => {
      const failed = this.state.transfers.filter((t) => t.status !== "done").length + this.refused;
      void this.end(failed > 0 ? "failed" : "complete", failed > 0 ? `${failed} ${failed === 1 ? "file was" : "files were"} not transferred.` : "The transfer is finished.");
    }, sends ? 300 : 2500);
  }

  private async end(reason: EndReason, message: string) {
    if (this.ended) return;
    this.ended = true;
    for (const timer of this.timers) clearTimeout(timer);
    if (this.idle) clearTimeout(this.idle);
    const transfers = this.controller ? this.state.transfers : [];
    const done: Extract<FerryEvent, { event: "done" }> = {
      event: "done",
      ok: reason === "complete",
      reason,
      message,
      sent: Math.max(this.sentFiles, transfers.filter((t) => t.direction === "out" && t.status === "done").length),
      received: this.saved.length,
      failed: transfers.filter((t) => t.status === "failed" || t.status === "cancelled").length + this.refused,
      saved: [...this.saved],
    };
    if (this.controller) {
      await this.controller.close().catch(() => undefined);
      await this.controller.stop().catch(() => undefined);
    }
    this.closeBackend();
    this.emit(done);
    this.finish(done);
  }
}
