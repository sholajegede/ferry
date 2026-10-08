import { fromBase64Url, randomId, toBase64Url } from "./bytes";
import { open, seal, type Session } from "./crypto";
import { FRAME_OVERHEAD, decodeFrame, encodeChunk, encodeControl } from "./frames";
import type {
  ChannelLike,
  ControlMessage,
  FileMeta,
  FileSink,
  NoteView,
  OutgoingItem,
  PeerEvent,
  SinkProvider,
  TransferStatus,
  TransferView,
} from "./types";

const WINDOW_BYTES = 16 * 1024 * 1024;
const BUFFER_HIGH = 4 * 1024 * 1024;
const BUFFER_LOW = 1024 * 1024;
const ACK_BYTES = 1024 * 1024;
const ACK_INTERVAL_MS = 150;
const MAX_MESSAGE = 256 * 1024;
const MIN_MESSAGE = 16 * 1024;
const MAX_NOTE_LENGTH = 20_000;
const PING_MS = 3_000;
const STALE_MS = 12_000;
const MAX_FILE_BYTES = 2 ** 44;
const ID_PATTERN = /^[A-Za-z0-9_-]{16,32}$/;

class Meter {
  rate = 0;
  private last = 0;
  private lastAt = 0;

  add(total: number) {
    const now = Date.now();
    if (!this.lastAt) {
      this.last = total;
      this.lastAt = now;
      return;
    }
    const elapsed = now - this.lastAt;
    if (elapsed < 400) return;
    const instant = ((total - this.last) * 1000) / elapsed;
    this.rate = this.rate ? this.rate * 0.6 + instant * 0.4 : instant;
    this.last = total;
    this.lastAt = now;
  }

  reset() {
    this.rate = 0;
    this.last = 0;
    this.lastAt = 0;
  }
}

type Outgoing = {
  item: OutgoingItem;
  status: TransferStatus;
  from: number;
  run: number;
  acked: number;
  stalls: number;
  meter: Meter;
  error?: TransferView["error"];
};

type Incoming = {
  meta: FileMeta;
  status: TransferStatus;
  received: number;
  sink?: FileSink;
  ackedAt: number;
  ackedBytes: number;
  meter: Meter;
  error?: TransferView["error"];
};

function cleanName(value: unknown) {
  const name = String(value ?? "file")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .trim()
    .slice(0, 200);
  return name && name !== "." && name !== ".." ? name : "file";
}

function cleanPath(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  const parts = value
    .split(/[\\/]/)
    .map((part) => part.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_").trim())
    .filter((part) => part && part !== "." && part !== "..");
  if (parts.length === 0) return undefined;
  return parts.slice(0, 32).join("/").slice(0, 1000);
}

function readMeta(raw: unknown): FileMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) return null;
  if (toBase64Url(fromBase64Url(value.id).subarray(0, 16)) !== value.id) return null;
  const size = Number(value.size);
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) return null;
  const type = /^[\w.+-]+\/[\w.+-]+$/.test(String(value.type))
    ? String(value.type).slice(0, 100)
    : "application/octet-stream";
  return {
    id: value.id,
    name: cleanName(value.name),
    path: cleanPath(value.path),
    size,
    type,
    batch: typeof value.batch === "string" ? value.batch.slice(0, 32) : "",
  };
}

function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

export class PeerSession {
  peerName: string;
  private channel: ChannelLike | null = null;
  private chunkSize = 64 * 1024 - FRAME_OVERHEAD;
  private outs = new Map<string, Outgoing>();
  private ins = new Map<string, Incoming>();
  private inbound: Promise<void> = Promise.resolve();
  private outbound: Promise<void> = Promise.resolve();
  private pumping = false;
  private waiters = new Set<() => void>();
  private opened = false;
  private failures = 0;
  private heardAt = 0;
  private pinger: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly peerId: string,
    private session: Session,
    private readonly options: {
      selfName: string;
      peerName: string;
      sinks: SinkProvider;
      emit: (event: PeerEvent) => void;
      changed: () => void;
      stale?: () => void;
    },
  ) {
    this.peerName = options.peerName;
  }

  get connected() {
    return !!this.channel && this.channel.readyState === "open";
  }

  rekey(session: Session) {
    this.session = session;
    this.opened = false;
    this.failures = 0;
  }

  attach(channel: ChannelLike, maxMessageSize?: number) {
    this.detach();
    const limit = Math.min(
      MAX_MESSAGE,
      Math.max(MIN_MESSAGE, maxMessageSize && maxMessageSize > 0 ? maxMessageSize : 64 * 1024),
    );
    this.chunkSize = limit - FRAME_OVERHEAD - 16;
    this.channel = channel;
    channel.binaryType = "arraybuffer";
    try {
      channel.bufferedAmountLowThreshold = BUFFER_LOW;
    } catch {}
    channel.onbufferedamountlow = () => this.wake();
    this.heardAt = Date.now();
    this.pinger = setInterval(() => {
      if (this.channel !== channel) return;
      if (Date.now() - this.heardAt > STALE_MS) this.options.stale?.();
      else this.control({ t: "ping" });
    }, PING_MS);
    channel.onmessage = (event) => {
      this.heardAt = Date.now();
      const bytes = toBytes(event.data);
      if (!bytes) return;
      this.inbound = this.inbound
        .then(() => this.handle(channel, bytes))
        .catch(() => undefined);
    };
    this.control({ t: "hello", name: this.options.selfName });
    this.reoffer();
    this.options.changed();
  }

  detach() {
    const channel = this.channel;
    if (!channel) return;
    channel.onmessage = null;
    channel.onbufferedamountlow = null;
    this.channel = null;
    if (this.pinger) clearInterval(this.pinger);
    this.pinger = null;
    for (const out of this.outs.values()) {
      if (["active", "finishing", "waiting"].includes(out.status)) {
        out.status = "queued";
        out.from = -1;
        out.run++;
        out.meter.reset();
      }
    }
    for (const incoming of this.ins.values()) {
      if (incoming.status === "active") {
        incoming.status = "waiting";
        incoming.meter.reset();
      }
    }
    this.wake();
    this.options.changed();
  }

  async destroy() {
    this.detach();
    for (const incoming of this.ins.values()) {
      const sink = incoming.sink;
      incoming.sink = undefined;
      if (sink) await sink.close().catch(() => undefined);
    }
  }

  offer(items: OutgoingItem[], revive = false) {
    const fresh: FileMeta[] = [];
    for (const item of items) {
      const existing = this.outs.get(item.id);
      if (existing && !(revive && ["cancelled", "failed"].includes(existing.status)))
        continue;
      this.outs.set(item.id, {
        item,
        status: "queued",
        from: -1,
        run: (existing?.run ?? 0) + 1,
        acked: 0,
        stalls: 0,
        meter: new Meter(),
      });
      fresh.push(this.metaOf(item));
    }
    if (fresh.length > 0 && this.connected) {
      for (const meta of fresh) this.outs.get(meta.id)!.status = "waiting";
      this.sendOffers(fresh);
    }
    this.options.changed();
  }

  sendNote(text: string): NoteView | null {
    const trimmed = text.slice(0, MAX_NOTE_LENGTH);
    if (!trimmed.trim() || !this.connected) return null;
    const id = randomId(9);
    this.control({ t: "note", id, text: trimmed });
    return { id, peerId: this.peerId, direction: "out", text: trimmed, at: Date.now() };
  }

  askToPair() {
    this.control({ t: "pair-ask" });
  }

  answerPair(yes: boolean) {
    this.control({ t: yes ? "pair-yes" : "pair-no" });
  }

  get pairSeed() {
    return this.session.pairSeed;
  }

  cancel(id: string, direction: "out" | "in") {
    if (direction === "out") {
      const out = this.outs.get(id);
      if (!out || ["done", "cancelled"].includes(out.status)) return;
      out.status = "cancelled";
      out.run++;
      this.control({ t: "cancel", id });
      this.wake();
    } else {
      const incoming = this.ins.get(id);
      if (!incoming || ["done", "cancelled"].includes(incoming.status)) return;
      this.control({ t: "cancel", id });
      void this.dropIncoming(incoming, "cancelled");
    }
    this.options.changed();
  }

  forget(id: string) {
    const out = this.outs.get(id);
    if (out && ["done", "cancelled", "failed"].includes(out.status)) this.outs.delete(id);
    const incoming = this.ins.get(id);
    if (incoming && ["done", "cancelled", "failed"].includes(incoming.status))
      this.ins.delete(id);
    this.options.changed();
  }

  snapshot(): TransferView[] {
    const views: TransferView[] = [];
    for (const out of this.outs.values()) {
      views.push({
        key: `${this.peerId}:out:${out.item.id}`,
        id: out.item.id,
        peerId: this.peerId,
        direction: "out",
        name: out.item.name,
        path: out.item.path,
        size: out.item.size,
        type: out.item.type,
        batch: out.item.batch,
        status: out.status,
        bytes: out.status === "done" ? out.item.size : out.acked,
        rate: out.status === "active" ? out.meter.rate : 0,
        error: out.error,
      });
    }
    for (const incoming of this.ins.values()) {
      views.push({
        key: `${this.peerId}:in:${incoming.meta.id}`,
        id: incoming.meta.id,
        peerId: this.peerId,
        direction: "in",
        name: incoming.meta.name,
        path: incoming.meta.path,
        size: incoming.meta.size,
        type: incoming.meta.type,
        batch: incoming.meta.batch,
        status: incoming.status,
        bytes: incoming.received,
        rate: incoming.status === "active" ? incoming.meter.rate : 0,
        error: incoming.error,
      });
    }
    return views;
  }

  private metaOf(item: OutgoingItem): FileMeta {
    return {
      id: item.id,
      name: item.name,
      path: item.path,
      size: item.size,
      type: item.type,
      batch: item.batch,
    };
  }

  private reoffer() {
    const metas: FileMeta[] = [];
    for (const out of this.outs.values()) {
      if (["done", "cancelled", "failed"].includes(out.status)) continue;
      out.status = "waiting";
      out.from = -1;
      out.run++;
      metas.push(this.metaOf(out.item));
    }
    this.sendOffers(metas);
  }

  private sendOffers(metas: FileMeta[]) {
    for (let i = 0; i < metas.length; i += 40)
      this.control({ t: "offer", files: metas.slice(i, i + 40) });
  }

  private control(message: ControlMessage) {
    const channel = this.channel;
    if (!channel || channel.readyState !== "open") return;
    this.outbound = this.outbound
      .then(() => seal(this.session.dataKey, encodeControl(message)))
      .then((frame) => {
        if (this.channel === channel && channel.readyState === "open")
          channel.send(frame as Uint8Array<ArrayBuffer>);
      })
      .catch(() => undefined);
  }

  private wake() {
    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const waiter of waiters) waiter();
  }

  private room() {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, 250);
      this.waiters.add(done);
    });
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const channel = this.channel;
        if (!channel || channel.readyState !== "open") break;
        let next: Outgoing | undefined;
        for (const out of this.outs.values()) {
          if (out.status === "waiting" && out.from >= 0) {
            next = out;
            break;
          }
        }
        if (!next) break;
        await this.sendFile(channel, next);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async sendFile(channel: ChannelLike, out: Outgoing) {
    const run = out.run;
    const { item } = out;
    let offset = out.from;
    out.status = "active";
    this.options.changed();
    const live = () =>
      this.channel === channel &&
      channel.readyState === "open" &&
      out.run === run &&
      out.status === "active";

    while (offset < item.size) {
      if (!live()) return;
      if (offset - out.acked > WINDOW_BYTES || channel.bufferedAmount > BUFFER_HIGH) {
        await this.room();
        continue;
      }
      const length = Math.min(this.chunkSize, item.size - offset);
      let data: Uint8Array;
      try {
        data = await item.source.read(offset, length);
        if (data.length !== length) throw new Error("Short read");
      } catch {
        if (!live()) return;
        out.status = "failed";
        out.error = "source";
        out.run++;
        this.control({ t: "cancel", id: item.id });
        this.options.changed();
        return;
      }
      const frame = await seal(this.session.dataKey, encodeChunk(item.id, offset, data));
      if (!live()) return;
      try {
        channel.send(frame as Uint8Array<ArrayBuffer>);
      } catch {
        return;
      }
      offset += length;
    }
    if (!live()) return;
    out.status = "finishing";
    this.control({ t: "end", id: item.id });
    this.options.changed();
  }

  private async handle(channel: ChannelLike, sealed: Uint8Array) {
    if (this.channel !== channel) return;
    let plain: Uint8Array;
    try {
      plain = await open(this.session.dataKey, sealed);
    } catch {
      this.failures++;
      if (!this.opened && this.failures === 1)
        this.options.emit({ type: "key-mismatch" });
      return;
    }
    this.opened = true;
    const frame = decodeFrame(plain);
    if (!frame) return;
    if (frame.kind === "chunk") {
      await this.onChunk(frame.id, frame.offset, frame.data);
      return;
    }
    await this.onControl(frame.message);
  }

  private async onChunk(id: string, offset: number, data: Uint8Array) {
    const incoming = this.ins.get(id);
    if (!incoming || incoming.status !== "active" || !incoming.sink) return;
    if (offset !== incoming.received) return;
    if (data.length === 0 || offset + data.length > incoming.meta.size) {
      this.control({ t: "cancel", id });
      await this.dropIncoming(incoming, "failed", "error");
      return;
    }
    const length = data.length;
    try {
      await incoming.sink.write(offset, data);
    } catch (error) {
      this.control({ t: "cancel", id });
      const full = error instanceof DOMException && error.name === "QuotaExceededError";
      await this.dropIncoming(incoming, "failed", full ? "space" : "error");
      return;
    }
    if (incoming.status !== "active") return;
    incoming.received += length;
    incoming.meter.add(incoming.received);
    this.options.sinks.progress(this.peerId, incoming.meta, incoming.received);
    const now = Date.now();
    if (
      incoming.received - incoming.ackedBytes >= ACK_BYTES ||
      now - incoming.ackedAt >= ACK_INTERVAL_MS
    ) {
      incoming.ackedBytes = incoming.received;
      incoming.ackedAt = now;
      this.control({ t: "ack", id, upto: incoming.received });
    }
    this.options.changed();
  }

  private async dropIncoming(
    incoming: Incoming,
    status: "cancelled" | "failed",
    error?: TransferView["error"],
  ) {
    incoming.status = status;
    incoming.error = error;
    const sink = incoming.sink;
    incoming.sink = undefined;
    if (sink) await sink.abort().catch(() => undefined);
    await this.options.sinks.discard(this.peerId, incoming.meta).catch(() => undefined);
    this.options.changed();
  }

  private async acceptOffer(meta: FileMeta) {
    const existing = this.ins.get(meta.id);
    if (existing?.status === "done") {
      this.control({ t: "received", id: meta.id });
      return;
    }
    if (existing?.sink && ["active", "waiting"].includes(existing.status)) {
      existing.status = "active";
      existing.ackedBytes = existing.received;
      this.control({ t: "accept", id: meta.id, from: existing.received });
      return;
    }
    const incoming: Incoming = {
      meta,
      status: "waiting",
      received: 0,
      ackedAt: Date.now(),
      ackedBytes: 0,
      meter: new Meter(),
    };
    this.ins.set(meta.id, incoming);
    try {
      const opened = await this.options.sinks.open(this.peerId, meta);
      if (opened === "done") {
        incoming.status = "done";
        incoming.received = meta.size;
        this.control({ t: "received", id: meta.id });
        return;
      }
      incoming.sink = opened.sink;
      incoming.received = opened.offset;
      incoming.ackedBytes = opened.offset;
      incoming.status = "active";
      this.control({ t: "accept", id: meta.id, from: opened.offset });
    } catch (error) {
      const full = error instanceof DOMException && error.name === "QuotaExceededError";
      incoming.status = "failed";
      incoming.error = full ? "space" : "error";
      this.control({ t: "reject", id: meta.id, reason: incoming.error });
    }
  }

  private async onControl(message: ControlMessage) {
    switch (message.t) {
      case "ping":
        return;
      case "hello": {
        if (typeof message.name === "string" && message.name.trim())
          this.peerName = message.name.trim().slice(0, 40);
        break;
      }
      case "offer": {
        if (!Array.isArray(message.files)) break;
        for (const raw of message.files.slice(0, 64)) {
          const meta = readMeta(raw);
          if (meta) await this.acceptOffer(meta);
        }
        break;
      }
      case "accept": {
        const out = this.outs.get(message.id);
        const from = Number(message.from);
        if (!out || ["done", "cancelled", "failed"].includes(out.status)) break;
        if (!Number.isSafeInteger(from) || from < 0 || from > out.item.size) break;
        if (out.status === "finishing" && from <= out.from) {
          if (++out.stalls > 3) {
            out.status = "failed";
            out.error = "error";
            out.run++;
            this.control({ t: "cancel", id: message.id });
            break;
          }
        } else {
          out.stalls = 0;
        }
        out.from = from;
        out.acked = from;
        out.run++;
        out.status = "waiting";
        out.meter.reset();
        void this.pump();
        break;
      }
      case "reject": {
        const out = this.outs.get(message.id);
        if (!out) break;
        out.status = "failed";
        out.error = message.reason === "space" ? "space" : "error";
        out.run++;
        break;
      }
      case "ack": {
        const out = this.outs.get(message.id);
        const upto = Number(message.upto);
        if (!out || !Number.isSafeInteger(upto)) break;
        out.acked = Math.max(out.acked, Math.min(upto, out.item.size));
        out.meter.add(out.acked);
        this.wake();
        break;
      }
      case "end": {
        const incoming = this.ins.get(message.id);
        if (!incoming || incoming.status !== "active") break;
        if (incoming.received !== incoming.meta.size) {
          this.control({ t: "accept", id: message.id, from: incoming.received });
          break;
        }
        const sink = incoming.sink;
        incoming.sink = undefined;
        try {
          if (sink) await sink.close();
          await this.options.sinks.complete(this.peerId, incoming.meta);
        } catch {
          await this.dropIncoming(incoming, "failed", "error");
          this.control({ t: "cancel", id: message.id });
          break;
        }
        incoming.status = "done";
        this.control({ t: "received", id: message.id });
        this.options.emit({ type: "received", meta: incoming.meta });
        break;
      }
      case "received": {
        const out = this.outs.get(message.id);
        if (!out || out.status === "done" || out.status === "cancelled") break;
        out.status = "done";
        out.acked = out.item.size;
        out.run++;
        this.options.emit({ type: "sent", meta: this.metaOf(out.item) });
        void this.pump();
        break;
      }
      case "cancel": {
        const out = this.outs.get(message.id);
        if (out && !["done", "cancelled"].includes(out.status)) {
          out.status = "cancelled";
          out.run++;
          this.wake();
        }
        const incoming = this.ins.get(message.id);
        if (incoming && !["done", "cancelled", "failed"].includes(incoming.status))
          await this.dropIncoming(incoming, "cancelled");
        break;
      }
      case "note": {
        if (typeof message.text !== "string" || typeof message.id !== "string") break;
        this.options.emit({
          type: "note",
          note: {
            id: message.id.slice(0, 32),
            peerId: this.peerId,
            direction: "in",
            text: message.text.slice(0, MAX_NOTE_LENGTH),
            at: Date.now(),
          },
        });
        break;
      }
      case "pair-ask":
        this.options.emit({ type: "pair-ask" });
        break;
      case "pair-yes":
        this.options.emit({ type: "pair-yes" });
        break;
      case "pair-no":
        this.options.emit({ type: "pair-no" });
        break;
    }
    this.options.changed();
  }
}
