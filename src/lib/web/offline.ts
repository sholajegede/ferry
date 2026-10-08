import { fromBase64Url, randomId, text, toBase64Url, utf8 } from "../protocol/bytes";
import { createKeyRecord, deriveSession, fileIdFor, type KeyRecord } from "../protocol/crypto";
import { detectRoute } from "../protocol/link";
import { PeerSession } from "../protocol/peer-session";
import type {
  ChannelLike,
  FileSource,
  NoteView,
  OutgoingItem,
  Route,
  TransferView,
} from "../protocol/types";
import { sinks } from "./sinks";

export type OfflineStep =
  | "idle"
  | "preparing"
  | "show-offer"
  | "show-answer"
  | "connecting"
  | "connected"
  | "lost"
  | "failed";

export type OfflineState = {
  step: OfflineStep;
  role: "starter" | "joiner" | null;
  localCode: string | null;
  peerName: string | null;
  route: Route | null;
  transfers: TransferView[];
  notes: NoteView[];
  error: string | null;
};

type Packet = { v: 1; s: string; k: string; n: string };

const PEER_ID = "offline-peer-device";

async function squeeze(value: string) {
  if (typeof CompressionStream === "undefined") return `F0.${toBase64Url(utf8(value))}`;
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return `F1.${toBase64Url(bytes)}`;
}

async function expand(code: string) {
  const trimmed = code.trim();
  const body = fromBase64Url(trimmed.slice(3));
  if (trimmed.startsWith("F0.")) return text(body);
  if (!trimmed.startsWith("F1.")) throw new Error("Unknown code");
  const stream = new Blob([body as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

function gathered(pc: RTCPeerConnection) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, 2500);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export class OfflineSession {
  private pc: RTCPeerConnection | null = null;
  private keys: KeyRecord | null = null;
  private peer: PeerSession | null = null;
  private pendingChannel: ChannelLike | null = null;
  private shared: OutgoingItem[] = [];
  private notes: NoteView[] = [];
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private state: OfflineState = {
    step: "idle",
    role: null,
    localCode: null,
    peerName: null,
    route: null,
    transfers: [],
    notes: [],
    error: null,
  };
  private arrivalListeners = new Set<(batchKey: string) => void>();

  onArrival = (listener: (batchKey: string) => void) => {
    this.arrivalListeners.add(listener);
    return () => {
      this.arrivalListeners.delete(listener);
    };
  };

  constructor(private readonly name: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  async start() {
    this.reset();
    this.patch({ step: "preparing", role: "starter" });
    try {
      const pc = this.connection();
      this.wire(pc.createDataChannel("ferry", { ordered: true }) as unknown as ChannelLike);
      this.keys = await createKeyRecord(false);
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      const packet: Packet = { v: 1, s: pc.localDescription!.sdp, k: this.keys.pub, n: this.name };
      this.patch({ step: "show-offer", localCode: await squeeze(JSON.stringify(packet)) });
    } catch {
      this.fail("This browser could not start an offline transfer.");
    }
  }

  async join(code: string) {
    this.reset();
    this.patch({ step: "preparing", role: "joiner" });
    try {
      const packet = JSON.parse(await expand(code)) as Packet;
      const pc = this.connection();
      pc.ondatachannel = (event) => this.wire(event.channel as unknown as ChannelLike);
      this.keys = await createKeyRecord(false);
      await pc.setRemoteDescription({ type: "offer", sdp: packet.s });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      await this.secure(packet, packet.k, this.keys.pub);
      const reply: Packet = { v: 1, s: pc.localDescription!.sdp, k: this.keys.pub, n: this.name };
      this.patch({ step: "show-answer", localCode: await squeeze(JSON.stringify(reply)) });
    } catch {
      this.fail("That code could not be read. Scan the code on the other device again.");
    }
  }

  async finish(code: string) {
    const pc = this.pc;
    if (!pc || !this.keys || this.state.role !== "starter") return;
    try {
      const packet = JSON.parse(await expand(code)) as Packet;
      await this.secure(packet, this.keys.pub, packet.k);
      await pc.setRemoteDescription({ type: "answer", sdp: packet.s });
      this.patch({ step: "connecting" });
      this.watchdog();
    } catch {
      this.fail("That reply code could not be read. Scan the reply on the other device again.");
    }
  }

  async share(sources: FileSource[]) {
    const batch = randomId(6);
    const items: OutgoingItem[] = [];
    for (const source of sources) {
      const id = await fileIdFor(source);
      if (items.some((item) => item.id === id)) continue;
      const existing = this.shared.find((item) => item.id === id);
      const item = existing ?? {
        id,
        name: source.name,
        path: source.path,
        size: source.size,
        type: source.type || "application/octet-stream",
        batch,
        source,
      };
      if (!existing) this.shared.push(item);
      items.push(item);
    }
    this.peer?.offer(items, true);
    this.refresh();
    return items.length;
  }

  sendNote(value: string) {
    const note = this.peer?.sendNote(value);
    if (!note) return false;
    this.notes = [...this.notes, note];
    this.refresh();
    return true;
  }

  cancel(transfer: Pick<TransferView, "id" | "direction">) {
    this.peer?.cancel(transfer.id, transfer.direction);
  }

  withdraw(id: string) {
    this.shared = this.shared.filter((item) => item.id !== id);
    this.peer?.cancel(id, "out");
    this.peer?.forget(id);
  }

  reset() {
    if (this.timer) clearTimeout(this.timer);
    void this.peer?.destroy();
    this.peer = null;
    this.pendingChannel = null;
    try {
      this.pc?.close();
    } catch {}
    this.pc = null;
    this.keys = null;
    this.patch({
      step: "idle",
      role: null,
      localCode: null,
      peerName: null,
      route: null,
      transfers: [],
      error: null,
    });
  }

  private connection() {
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pc = pc;
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === "connected") {
        void detectRoute(pc).then((route) => this.patch({ route }));
      } else if (pc.connectionState === "failed") {
        if (this.state.step === "connected") {
          this.peer?.detach();
          this.patch({ step: "lost" });
        } else {
          this.fail(
            "The two devices could not reach each other. Put both on the same Wi-Fi or hotspot and try again.",
          );
        }
      }
    };
    return pc;
  }

  private watchdog() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.state.step === "connecting" || this.state.step === "show-answer")
        this.fail(
          "The two devices could not reach each other. Put both on the same Wi-Fi or hotspot and try again.",
        );
    }, 25_000);
  }

  private wire(channel: ChannelLike) {
    const open = () => {
      this.pendingChannel = channel;
      this.attach();
    };
    channel.onopen = open;
    channel.onclose = () => {
      if (this.state.step === "connected") {
        this.peer?.detach();
        this.patch({ step: "lost" });
      }
    };
    if (channel.readyState === "open") open();
  }

  private attach() {
    if (!this.peer || !this.pendingChannel || !this.pc) return;
    this.peer.attach(this.pendingChannel, this.pc.sctp?.maxMessageSize);
    this.pendingChannel = null;
    this.peer.offer(this.shared);
    if (this.timer) clearTimeout(this.timer);
    this.patch({ step: "connected" });
  }

  private async secure(packet: Packet, hostPub: string, guestPub: string) {
    if (!this.keys) throw new Error("No keys");
    const session = await deriveSession({
      privateKey: this.keys.pair.privateKey,
      peerPub: packet.k,
      context: "offline",
      hostPub,
      guestPub,
      linkSecret: null,
    });
    this.peer = new PeerSession(PEER_ID, session, {
      selfName: this.name,
      peerName: String(packet.n ?? "Other device").slice(0, 40),
      sinks,
      emit: (event) => {
        if (event.type === "note") this.notes = [...this.notes, event.note];
        if (event.type === "note-delivered")
          this.notes = this.notes.map((note) =>
            note.direction === "out" && note.id === event.id ? { ...note, delivered: true } : note,
          );
        if (event.type === "received")
          for (const listener of this.arrivalListeners)
            listener(`${PEER_ID}:${event.meta.batch}`);
        this.refresh();
      },
      changed: () => this.refresh(),
    });
    this.patch({ peerName: this.peer.peerName });
    this.attach();
  }

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private refresh() {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.patch({});
    }, 60);
  }

  private fail(error: string) {
    this.patch({ step: "failed", error });
  }

  private patch(next: Partial<OfflineState>) {
    this.state = {
      ...this.state,
      ...next,
      transfers: this.peer?.snapshot() ?? [],
      notes: this.notes,
      peerName: next.peerName ?? this.peer?.peerName ?? this.state.peerName,
    };
    for (const listener of this.listeners) listener();
  }
}
