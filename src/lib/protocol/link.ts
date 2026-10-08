import type { ChannelLike, Route } from "./types";

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type Signal =
  | { gen: number; kind: "offer" | "answer"; sdp: string }
  | { gen: number; kind: "ice"; candidate: RTCIceCandidateInit }
  | { gen: number; kind: "retry"; cold?: boolean };

export type LinkStatus = "connecting" | "connected" | "reconnecting";

type Options = {
  initiator: boolean;
  createConnection(config: { iceServers: IceServer[] }): RTCPeerConnection;
  iceServers(): Promise<IceServer[]>;
  send(signal: Signal): void;
  onChannel(channel: ChannelLike, maxMessageSize?: number): void;
  onDown(): void;
  onChange(): void;
};

const CONNECT_TIMEOUT_MS = 20_000;
const DISCONNECT_GRACE_MS = 5_000;

export class Link {
  status: LinkStatus = "connecting";
  route: Route | null = null;
  attempts = 0;
  private pc: RTCPeerConnection | null = null;
  private gen = 0;
  private pending: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRetryAt = 0;
  private stopped = false;
  private everConnected = false;
  private startedAt = 0;

  constructor(private readonly options: Options) {}

  start() {
    if (this.options.initiator) void this.connect();
    else this.arm(1_500);
  }

  restart() {
    if (this.stopped) return;
    this.recover();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    this.teardown();
  }

  nudge() {
    if (this.stopped || this.status === "connected") return;
    if (this.options.initiator) this.reconnectIn(0);
    else this.askRetry();
  }

  async onSignal(signal: Signal) {
    if (this.stopped) return;
    if (signal.kind === "retry") {
      if (!this.options.initiator) return;
      const settling = Date.now() - this.startedAt < 3_000;
      if (this.status !== "connected" ? !settling || !signal.cold : !!signal.cold)
        this.reconnectIn(0);
      return;
    }
    if (this.options.initiator) {
      const pc = this.pc;
      if (!pc || signal.gen !== this.gen) return;
      if (signal.kind === "answer") {
        if (pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await this.flushCandidates(pc);
      } else if (signal.kind === "ice") {
        await this.addCandidate(pc, signal.candidate);
      }
      return;
    }
    if (signal.kind === "offer") {
      if (signal.gen <= this.gen) return;
      this.teardown();
      this.gen = signal.gen;
      const pc = await this.build(signal.gen);
      if (this.stopped || this.pc !== pc) return;
      pc.ondatachannel = (event) => this.wire(pc, event.channel as unknown as ChannelLike);
      await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
      await this.flushCandidates(pc);
      await pc.setLocalDescription(await pc.createAnswer());
      if (this.pc !== pc || !pc.localDescription) return;
      this.options.send({ gen: signal.gen, kind: "answer", sdp: pc.localDescription.sdp });
      this.arm(CONNECT_TIMEOUT_MS);
    } else if (signal.kind === "ice" && this.pc && signal.gen === this.gen) {
      await this.addCandidate(this.pc, signal.candidate);
    }
  }

  private async connect() {
    if (this.stopped) return;
    this.teardown();
    const gen = Math.max(Date.now(), this.gen + 1);
    this.gen = gen;
    this.startedAt = Date.now();
    try {
      const pc = await this.build(gen);
      if (this.stopped || this.pc !== pc) return;
      this.wire(pc, pc.createDataChannel("ferry", { ordered: true }) as unknown as ChannelLike);
      await pc.setLocalDescription(await pc.createOffer());
      if (this.pc !== pc || !pc.localDescription) return;
      this.options.send({ gen, kind: "offer", sdp: pc.localDescription.sdp });
      this.arm(CONNECT_TIMEOUT_MS);
    } catch {
      this.recover();
    }
  }

  private async build(gen: number) {
    const iceServers = await this.options.iceServers();
    const pc = this.options.createConnection({ iceServers });
    this.pc = pc;
    this.pending = [];
    this.remoteSet = false;
    pc.onicecandidate = (event) => {
      if (event.candidate && this.pc === pc)
        this.options.send({ gen, kind: "ice", candidate: event.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => this.onState(pc);
    return pc;
  }

  private wire(pc: RTCPeerConnection, channel: ChannelLike) {
    const ready = () => {
      if (this.pc !== pc || this.stopped) return;
      this.options.onChannel(channel, pc.sctp?.maxMessageSize);
    };
    channel.onopen = ready;
    channel.onclose = () => {
      if (this.pc !== pc || this.stopped) return;
      this.recover();
    };
    channel.onerror = () => undefined;
    if (channel.readyState === "open") ready();
  }

  private onState(pc: RTCPeerConnection) {
    if (this.pc !== pc || this.stopped) return;
    const state = pc.connectionState;
    if (state === "connected") {
      this.clearTimers();
      this.status = "connected";
      this.attempts = 0;
      this.everConnected = true;
      void this.readRoute(pc);
      this.options.onChange();
    } else if (state === "disconnected") {
      this.status = "reconnecting";
      this.options.onChange();
      this.arm(DISCONNECT_GRACE_MS);
    } else if (state === "failed" || state === "closed") {
      this.recover();
    }
  }

  private recover() {
    if (this.stopped) return;
    this.clearTimers();
    this.options.onDown();
    this.status = this.everConnected ? "reconnecting" : "connecting";
    this.route = null;
    this.options.onChange();
    if (this.options.initiator) {
      const delay = Math.min(15_000, 1000 * 2 ** Math.min(this.attempts, 4));
      this.attempts++;
      this.reconnectIn(delay);
    } else {
      this.attempts++;
      this.askRetry();
      this.arm(8_000);
    }
  }

  private reconnectIn(delay: number) {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }

  private askRetry() {
    const now = Date.now();
    if (now - this.lastRetryAt < 4_000) return;
    this.lastRetryAt = now;
    this.options.send({ gen: this.gen, kind: "retry", cold: this.gen === 0 });
  }

  private arm(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.stopped) return;
      if (this.pc?.connectionState === "connected") return;
      this.recover();
    }, delay);
  }

  private clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = null;
    this.retryTimer = null;
  }

  private teardown() {
    const pc = this.pc;
    this.pc = null;
    if (!pc) return;
    pc.onicecandidate = null;
    pc.onconnectionstatechange = null;
    pc.ondatachannel = null;
    try {
      pc.close();
    } catch {}
    this.options.onDown();
  }

  private async addCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit) {
    if (!this.remoteSet) {
      this.pending.push(candidate);
      return;
    }
    await pc.addIceCandidate(candidate).catch(() => undefined);
  }

  private async flushCandidates(pc: RTCPeerConnection) {
    this.remoteSet = true;
    const queued = this.pending;
    this.pending = [];
    for (const candidate of queued)
      await pc.addIceCandidate(candidate).catch(() => undefined);
  }

  private async readRoute(pc: RTCPeerConnection) {
    try {
      this.route = await detectRoute(pc);
      this.options.onChange();
    } catch {}
  }
}

export async function detectRoute(pc: RTCPeerConnection): Promise<Route | null> {
  if (typeof pc.getStats !== "function") return null;
  const stats = await pc.getStats();
  const byId = new Map<string, Record<string, unknown>>();
  let pairId: string | undefined;
  stats.forEach((report: Record<string, unknown>) => {
    byId.set(report.id as string, report);
    if (report.type === "transport" && report.selectedCandidatePairId)
      pairId = report.selectedCandidatePairId as string;
  });
  let pair = pairId ? byId.get(pairId) : undefined;
  if (!pair) {
    for (const report of byId.values()) {
      if (
        report.type === "candidate-pair" &&
        (report.selected || (report.nominated && report.state === "succeeded"))
      ) {
        pair = report;
        break;
      }
    }
  }
  if (!pair) return null;
  const local = byId.get(pair.localCandidateId as string);
  const remote = byId.get(pair.remoteCandidateId as string);
  if (!local || !remote) return null;
  if (local.candidateType === "relay" || remote.candidateType === "relay") return "relay";
  if (local.candidateType === "host" && remote.candidateType === "host") return "lan";
  return "direct";
}
