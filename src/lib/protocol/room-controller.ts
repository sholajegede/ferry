import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { api } from "../../../convex/_generated/api";
import { randomId } from "./bytes";
import {
  commitMatches,
  createKeyRecord,
  deriveSession,
  fileIdFor,
  resendIdFor,
  joinTokenFor,
  openText,
  sealText,
  type KeyRecord,
  type Session,
} from "./crypto";
import { extensionOf, kindOf, sizeBucket } from "./file-kind";
import { Link, type IceServer, type Signal } from "./link";
import { PeerSession } from "./peer-session";
import type {
  FileMeta,
  FileSource,
  NoteView,
  OutgoingItem,
  PeerEvent,
  Route,
  SinkProvider,
  TransferView,
} from "./types";

export type Backend = {
  mutation<M extends FunctionReference<"mutation">>(
    ref: M,
    args: FunctionArgs<M>,
  ): Promise<FunctionReturnType<M>>;
  action<A extends FunctionReference<"action">>(
    ref: A,
    args: FunctionArgs<A>,
  ): Promise<FunctionReturnType<A>>;
  subscribe<Q extends FunctionReference<"query">>(
    ref: Q,
    args: FunctionArgs<Q>,
    onValue: (value: FunctionReturnType<Q>) => void,
    onError?: (error: unknown) => void,
  ): () => void;
};

export type KeyStore = {
  get(id: string): Promise<KeyRecord | null>;
  put(id: string, record: KeyRecord): Promise<void>;
};

export type Platform = {
  createConnection(config: { iceServers: IceServer[] }): RTCPeerConnection;
  keys: KeyStore;
  sinks: SinkProvider;
  onWake?(callback: () => void): () => void;
};

export type Identity = { deviceId: string; deviceSecret: string; name: string };

export type Phase =
  | "loading"
  | "ready"
  | "approval"
  | "closed"
  | "expired"
  | "missing"
  | "declined"
  | "full"
  | "bad-link"
  | "error";

export type PeerStatus =
  | "approval"
  | "securing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "mismatch";

export type PeerView = {
  id: string;
  name: string;
  status: PeerStatus;
  code: string | null;
  linked: boolean;
  via: "link" | "code" | "nearby";
  route: Route | null;
  attempts: number;
};

export type RoomState = {
  phase: Phase;
  role: "host" | "guest" | null;
  roomId: string;
  code: string | null;
  expiresAt: number | null;
  visible: boolean;
  nearbyReady: boolean;
  hostName: string | null;
  peers: PeerView[];
  transfers: TransferView[];
  notes: NoteView[];
  queued: number;
  pending: FileMeta[];
};

export type RoomEvent =
  | { type: "received"; peerId: string; meta: FileMeta }
  | { type: "sent"; peerId: string; meta: FileMeta }
  | { type: "note"; note: NoteView }
  | { type: "pair-ask"; peerId: string; name: string }
  | { type: "paired"; peerId: string; name: string; seed: Uint8Array }
  | { type: "pair-declined"; peerId: string; name: string }
  | { type: "joined"; peerId: string; name: string };

type View = FunctionReturnType<typeof api.rooms.view>;
type Inbox = FunctionReturnType<typeof api.signals.inbox>;

type Peer = {
  id: string;
  name: string;
  via: "link" | "code" | "nearby";
  admitted: boolean;
  epoch: number;
  session: Session | null;
  sessionEpoch: number;
  peer: PeerSession | null;
  link: Link | null;
  mismatch: boolean;
  announced: boolean;
};

function errorCode(error: unknown): string {
  const data = (error as { data?: { code?: string } } | null)?.data;
  return data?.code ?? "error";
}

export class RoomController {
  private readonly creds: { deviceId: string; deviceSecret: string };
  private peers = new Map<string, Peer>();
  private shared: OutgoingItem[] = [];
  private notes: NoteView[] = [];
  private view: View | undefined;
  private inbox: Inbox = [];
  private seen = new Set<string>();
  private phase: Phase = "loading";
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: RoomEvent) => void>();
  private unsubs: (() => void)[] = [];
  private chain: Promise<void> = Promise.resolve();
  private state: RoomState;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private ice: { at: number; value: Promise<IceServer[]> } | null = null;
  private joining = 0;
  private rekeyed = new Set<string>();
  private stopped = false;

  constructor(
    private readonly options: {
      backend: Backend;
      platform: Platform;
      identity: Identity;
      roomId: string;
      linkSecret: string | null;
      via: "link" | "code" | "nearby";
    },
  ) {
    this.creds = {
      deviceId: options.identity.deviceId,
      deviceSecret: options.identity.deviceSecret,
    };
    this.state = this.build();
  }

  start() {
    const { backend, roomId } = this.options;
    this.unsubs.push(
      backend.subscribe(
        api.rooms.view,
        { ...this.creds, roomId },
        (value) => {
          this.view = value;
          this.run(() => this.reconcile());
        },
        () => this.setPhase("error"),
      ),
      backend.subscribe(api.signals.inbox, { ...this.creds, roomId }, (value) => {
        this.inbox = value;
        this.run(() => this.drain());
      }),
    );
    this.beat = setInterval(() => this.touch(), 25_000);
    const wake = this.options.platform.onWake?.(() => {
      for (const peer of this.peers.values()) peer.link?.nudge();
    });
    if (wake) this.unsubs.push(wake);
  }

  async stop() {
    this.stopped = true;
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    if (this.beat) clearInterval(this.beat);
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    if (this.clearTimer) clearTimeout(this.clearTimer);
    for (const peer of this.peers.values()) {
      peer.link?.stop();
      await peer.peer?.destroy();
    }
    this.peers.clear();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  onEvent(listener: (event: RoomEvent) => void) {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /** How a file stands with the devices in the room: not offered, on its way, or across on all of them. */
  private standing(id: string): "new" | "busy" | "done" {
    const states = [...this.peers.values()]
      .filter((peer) => peer.admitted && peer.peer)
      .map((peer) => peer.peer!.outStatus(id))
      .filter((status) => status !== undefined);
    if (states.length === 0) return this.shared.some((item) => item.id === id) ? "busy" : "new";
    if (states.every((status) => status === "done")) return "done";
    return states.some((status) => status === "cancelled" || status === "failed") ? "new" : "busy";
  }

  /**
   * Offer files to every device in the room.
   * A file that is still on its way is left alone and counted in `busy`.
   * A file that already went across is sent again as a new transfer.
   */
  async share(sources: FileSource[]) {
    const batch = randomId(6);
    const items: OutgoingItem[] = [];
    let busy = 0;
    for (const source of sources) {
      const base = await fileIdFor(source);
      let id = base;
      let round = 1;
      let standing = this.standing(id);
      while (standing === "done") {
        id = await resendIdFor(base, ++round);
        standing = this.standing(id);
      }
      if (items.some((item) => item.id === id)) continue;
      const existing = this.shared.find((item) => item.id === id);
      if (existing && standing === "busy") busy += 1;
      items.push(
        existing ?? {
          id,
          name: source.name,
          path: source.path,
          size: source.size,
          type: source.type || "application/octet-stream",
          batch,
          source,
        },
      );
      if (!existing) this.shared.push(items[items.length - 1]);
    }
    for (const peer of this.peers.values())
      if (peer.admitted && peer.peer) peer.peer.offer(items, true);
    this.notify();
    return { offered: items.length - busy, busy };
  }

  sendNote(text: string) {
    let sent: NoteView | null = null;
    for (const peer of this.peers.values()) {
      if (!peer.admitted) continue;
      const note = peer.peer?.sendNote(text);
      if (note && !sent) sent = note;
    }
    if (!sent) return false;
    this.notes = [...this.notes, sent];
    void this.options.backend
      .mutation(api.stats.track, { ...this.creds, event: "note" })
      .catch(() => undefined);
    this.notify();
    return true;
  }

  cancel(transfer: Pick<TransferView, "id" | "peerId" | "direction">) {
    this.peers.get(transfer.peerId)?.peer?.cancel(transfer.id, transfer.direction);
  }

  retry(id: string) {
    const item = this.shared.find((entry) => entry.id === id);
    if (!item) return false;
    for (const peer of this.peers.values())
      if (peer.admitted && peer.peer) peer.peer.offer([item], true);
    this.notify();
    return true;
  }

  withdraw(id: string) {
    this.shared = this.shared.filter((item) => item.id !== id);
    for (const peer of this.peers.values()) {
      peer.peer?.cancel(id, "out");
      peer.peer?.forget(id);
    }
    this.notify();
  }

  async decide(peerId: string, admit: boolean) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    await this.options.backend.mutation(api.rooms.decide, {
      ...this.creds,
      roomId: this.options.roomId,
      guestId: peerId,
      epoch: peer.epoch,
      admit,
    });
  }

  askToPair(peerId: string) {
    this.peers.get(peerId)?.peer?.askToPair();
  }

  answerPair(peerId: string, yes: boolean) {
    const peer = this.peers.get(peerId);
    if (!peer?.peer) return;
    peer.peer.answerPair(yes);
    if (yes) this.finishPair(peer);
  }

  async setVisible(visible: boolean, netToken?: string) {
    await this.options.backend.mutation(api.rooms.setVisible, {
      ...this.creds,
      roomId: this.options.roomId,
      visible,
      netToken,
    });
  }

  async close() {
    const { backend, roomId } = this.options;
    if (this.state.role === "host")
      await backend.mutation(api.rooms.close, { ...this.creds, roomId });
    else await backend.mutation(api.rooms.leave, { ...this.creds, roomId });
  }

  private run(task: () => Promise<void>) {
    this.chain = this.chain
      .then(() => (this.stopped ? undefined : task()))
      .catch(() => undefined);
  }

  private emit(event: RoomEvent) {
    for (const listener of this.eventListeners) listener(event);
  }

  private notify = () => {
    if (this.notifyTimer || this.stopped) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.state = this.build();
      for (const listener of this.listeners) listener();
    }, 60);
  };

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.notify();
  }

  private build(): RoomState {
    const view = this.view;
    const role = view && view.role !== "none" ? view.role : null;
    const peers: PeerView[] = [];
    const transfers: TransferView[] = [];
    for (const peer of this.peers.values()) {
      let status: PeerStatus;
      if (peer.mismatch) status = "mismatch";
      else if (!peer.session) status = "securing";
      else if (!peer.admitted) status = "approval";
      else if (peer.peer?.connected) status = "connected";
      else status = peer.link?.status === "reconnecting" ? "reconnecting" : "connecting";
      peers.push({
        id: peer.id,
        name: peer.peer?.peerName ?? peer.name,
        status,
        code: peer.session?.code ?? null,
        linked: !!peer.session?.linked,
        via: peer.via,
        route: peer.link?.route ?? null,
        attempts: peer.link?.attempts ?? 0,
      });
      if (peer.peer) transfers.push(...peer.peer.snapshot());
    }
    const offered = new Set(transfers.filter((t) => t.direction === "out").map((t) => t.id));
    return {
      phase: this.phase,
      role,
      roomId: this.options.roomId,
      code: view?.role === "host" ? view.room.code : null,
      expiresAt: view?.room?.expiresAt ?? null,
      visible: view?.role === "host" ? view.room.visible : false,
      nearbyReady: view?.role === "host" ? view.room.nearbyReady : false,
      hostName: view?.room?.hostName ?? null,
      peers,
      transfers,
      notes: this.notes,
      queued: this.shared.filter((item) => !offered.has(item.id)).length,
      pending: this.shared
        .filter((item) => !offered.has(item.id))
        .map(({ id, name, path, size, type, batch }) => ({ id, name, path, size, type, batch })),
    };
  }

  private touch() {
    if (this.phase !== "ready" && this.phase !== "approval") return;
    void this.options.backend
      .mutation(api.rooms.touch, { ...this.creds, roomId: this.options.roomId })
      .catch(() => undefined);
  }

  private iceServers = () => {
    const now = Date.now();
    if (!this.ice || now - this.ice.at > 3_000_000) {
      const value = this.options.backend
        .action(api.turn.iceServers, this.creds)
        .catch(() => [{ urls: "stun:stun.l.google.com:19302" }] as IceServer[]);
      this.ice = { at: now, value };
    }
    return this.ice.value;
  };

  private async reconcile() {
    const view = this.view;
    if (!view) return;
    if (!view.room) return this.finish("missing");
    if (view.room.status === "closed") return this.finish("closed");
    if (view.room.expiresAt < Date.now()) return this.finish("expired");
    if (view.role === "host") await this.reconcileHost(view);
    else await this.reconcileGuest(view);
    this.notify();
    await this.drain();
  }

  private finish(phase: Phase) {
    for (const peer of this.peers.values()) this.dropLink(peer);
    this.setPhase(phase);
  }

  private makePeer(id: string, name: string, via: Peer["via"]): Peer {
    const peer: Peer = {
      id,
      name,
      via,
      admitted: false,
      epoch: 0,
      session: null,
      sessionEpoch: 0,
      peer: null,
      link: null,
      mismatch: false,
      announced: false,
    };
    this.peers.set(id, peer);
    return peer;
  }

  private async reconcileHost(view: Extract<View, { role: "host" }>) {
    const { backend, platform, roomId, linkSecret } = this.options;
    this.phase = "ready";
    const present = new Set<string>();
    for (const guest of view.guests) {
      if (guest.state === "declined") continue;
      present.add(guest.deviceId);
      const peer =
        this.peers.get(guest.deviceId) ??
        this.makePeer(guest.deviceId, guest.name, guest.via);
      peer.name = guest.name;
      peer.via = guest.via;
      peer.admitted = guest.state === "admitted";
      if (peer.epoch !== guest.epoch) {
        peer.epoch = guest.epoch;
        peer.session = null;
        peer.mismatch = false;
        this.dropLink(peer);
      }
      const keyId = `${roomId}:${guest.deviceId}:${guest.epoch}`;

      if (guest.commit && !guest.hostPub) {
        let record = await platform.keys.get(keyId);
        if (!record) {
          record = await createKeyRecord(false);
          await platform.keys.put(keyId, record);
        }
        await backend
          .mutation(api.rooms.setHostKey, {
            ...this.creds,
            roomId,
            guestId: guest.deviceId,
            epoch: guest.epoch,
            hostPub: record.pub,
          })
          .catch(() => undefined);
        continue;
      }

      if (guest.hostPub && !peer.session) {
        const record = await platform.keys.get(keyId);
        if (!record || record.pub !== guest.hostPub) {
          if (!this.rekeyed.has(keyId)) {
            this.rekeyed.add(keyId);
            await backend
              .mutation(api.rooms.requestRekey, {
                ...this.creds,
                roomId,
                guestId: guest.deviceId,
              })
              .catch(() => undefined);
          }
          continue;
        }
        if (!guest.guestPub || !guest.nonce || !guest.commit) continue;
        if (!(await commitMatches(guest.guestPub, guest.nonce, guest.commit))) {
          peer.mismatch = true;
          continue;
        }
        if (guest.via === "link" && !linkSecret) {
          peer.mismatch = true;
          continue;
        }
        peer.session = await deriveSession({
          privateKey: record.pair.privateKey,
          peerPub: guest.guestPub,
          context: roomId,
          hostPub: guest.hostPub,
          guestPub: guest.guestPub,
          linkSecret: guest.via === "link" ? linkSecret : null,
        });
        peer.sessionEpoch = guest.epoch;
        this.ensureSession(peer);
      }

      if (peer.admitted && peer.session) this.ensureLink(peer, true);
      else this.dropLink(peer);
    }
    for (const peer of [...this.peers.values()]) {
      if (present.has(peer.id)) continue;
      this.dropLink(peer);
      await peer.peer?.destroy();
      this.peers.delete(peer.id);
    }
  }

  private async reconcileGuest(view: Exclude<View, { role: "host" }>) {
    const { backend, platform, roomId, linkSecret } = this.options;
    const room = view.room;
    if (!room) return;
    const keyId = `${roomId}:guest`;

    if (view.role === "none") {
      await this.join();
      return;
    }
    const me = view.me;
    if (me.state === "declined") return this.finish("declined");

    const record = await platform.keys.get(keyId);
    if (me.needsCommit || !record || record.commit !== me.commit) {
      await this.join();
      return;
    }
    this.joining = 0;

    const host =
      this.peers.get(room.hostDeviceId) ??
      this.makePeer(room.hostDeviceId, room.hostName, me.via);
    host.name = room.hostName;
    host.via = me.via;
    host.admitted = me.state === "admitted";
    if (host.epoch !== me.epoch) {
      host.epoch = me.epoch;
      host.session = null;
      host.mismatch = false;
      this.dropLink(host);
    }

    if (me.hostPub && !me.revealed && record.nonce) {
      await backend
        .mutation(api.rooms.reveal, {
          ...this.creds,
          roomId,
          epoch: me.epoch,
          guestPub: record.pub,
          nonce: record.nonce,
        })
        .catch(() => undefined);
    }

    if (me.hostPub && !host.session) {
      host.session = await deriveSession({
        privateKey: record.pair.privateKey,
        peerPub: me.hostPub,
        context: roomId,
        hostPub: me.hostPub,
        guestPub: record.pub,
        linkSecret: me.via === "link" ? linkSecret : null,
      });
      host.sessionEpoch = me.epoch;
      this.ensureSession(host);
    }

    this.phase = host.admitted ? "ready" : "approval";
    if (host.admitted && host.session && me.revealed) this.ensureLink(host, false);
    else this.dropLink(host);
  }

  private async join() {
    const now = Date.now();
    if (now - this.joining < 8_000) return;
    this.joining = now;
    const { backend, platform, roomId, linkSecret, via } = this.options;
    const record = await createKeyRecord(true);
    await platform.keys.put(`${roomId}:guest`, record);
    try {
      await backend.mutation(api.rooms.join, {
        ...this.creds,
        roomId,
        commit: record.commit!,
        joinToken: linkSecret ? await joinTokenFor(linkSecret, roomId) : undefined,
        via: linkSecret ? "link" : via === "link" ? "code" : via,
      });
    } catch (error) {
      const code = errorCode(error);
      const phases: Record<string, Phase> = {
        "not-found": "missing",
        closed: "closed",
        expired: "expired",
        declined: "declined",
        full: "full",
        "bad-link": "bad-link",
      };
      this.setPhase(phases[code] ?? "error");
    }
  }

  private ensureSession(peer: Peer) {
    if (!peer.session) return;
    if (peer.peer) {
      peer.peer.rekey(peer.session);
      return;
    }
    peer.peer = new PeerSession(peer.id, peer.session, {
      selfName: this.options.identity.name,
      peerName: peer.name,
      sinks: this.options.platform.sinks,
      emit: (event) => this.onPeerEvent(peer, event),
      changed: this.notify,
      stale: () => peer.link?.restart(),
    });
  }

  private ensureLink(peer: Peer, initiator: boolean) {
    if (peer.link || !peer.session || !peer.peer) return;
    const session = peer.session;
    const { backend, roomId, platform } = this.options;
    const link = new Link({
      initiator,
      createConnection: platform.createConnection,
      iceServers: this.iceServers,
      send: (signal: Signal) => {
        void sealText(session.signalKey, JSON.stringify(signal))
          .then((payload) =>
            backend.mutation(api.signals.send, {
              ...this.creds,
              roomId,
              to: peer.id,
              payload,
            }),
          )
          .catch(() => undefined);
      },
      onChannel: (channel, maxMessageSize) => {
        if (peer.link !== link) return;
        peer.peer?.attach(channel, maxMessageSize);
        peer.peer?.offer(this.shared);
        if (!peer.announced) {
          peer.announced = true;
          this.emit({ type: "joined", peerId: peer.id, name: peer.name });
          if (!initiator)
            void backend
              .mutation(api.stats.track, { ...this.creds, event: "join", via: peer.via })
              .catch(() => undefined);
        }
        this.scheduleClear();
        this.notify();
      },
      onDown: () => {
        if (peer.link === link) peer.peer?.detach();
      },
      onChange: this.notify,
    });
    peer.link = link;
    link.start();
  }

  private dropLink(peer: Peer) {
    const link = peer.link;
    if (!link) return;
    peer.link = null;
    link.stop();
    peer.peer?.detach();
  }

  private onPeerEvent(peer: Peer, event: PeerEvent) {
    const name = peer.peer?.peerName ?? peer.name;
    switch (event.type) {
      case "sent":
        void this.options.backend
          .mutation(api.stats.track, {
            ...this.creds,
            event: "file",
            bytes: event.meta.size,
            kind: kindOf(event.meta.name, event.meta.type),
            ext: extensionOf(event.meta.name) || undefined,
            bucket: sizeBucket(event.meta.size),
            route: peer.link?.route ?? undefined,
          })
          .catch(() => undefined);
        this.emit({ type: "sent", peerId: peer.id, meta: event.meta });
        break;
      case "received":
        this.emit({ type: "received", peerId: peer.id, meta: event.meta });
        break;
      case "note":
        this.notes = [...this.notes, event.note];
        this.emit({ type: "note", note: event.note });
        this.notify();
        break;
      case "note-delivered":
        this.notes = this.notes.map((note) =>
          note.direction === "out" && note.id === event.id ? { ...note, delivered: true } : note,
        );
        this.notify();
        break;
      case "pair-ask":
        this.emit({ type: "pair-ask", peerId: peer.id, name });
        break;
      case "pair-yes":
        this.finishPair(peer);
        break;
      case "pair-no":
        this.emit({ type: "pair-declined", peerId: peer.id, name });
        break;
      case "key-mismatch":
        peer.mismatch = true;
        break;
    }
    this.notify();
  }

  private finishPair(peer: Peer) {
    if (!peer.peer) return;
    void this.options.backend
      .mutation(api.pairs.link, { ...this.creds, peer: peer.id })
      .catch(() => undefined);
    void this.options.backend
      .mutation(api.stats.track, { ...this.creds, event: "pair" })
      .catch(() => undefined);
    this.emit({
      type: "paired",
      peerId: peer.id,
      name: peer.peer.peerName,
      seed: peer.peer.pairSeed,
    });
  }

  private async drain() {
    let pending = false;
    let latest = 0;
    for (const message of this.inbox) {
      if (this.seen.has(message.id)) {
        latest = Math.max(latest, message.at);
        continue;
      }
      const peer = this.peers.get(message.from);
      if (!peer?.session || !peer.link) {
        pending = true;
        continue;
      }
      this.seen.add(message.id);
      latest = Math.max(latest, message.at);
      try {
        const signal = JSON.parse(
          await openText(peer.session.signalKey, message.payload),
        ) as Signal;
        await peer.link.onSignal(signal);
      } catch {
        continue;
      }
    }
    if (!pending && latest > 0 && this.inbox.length >= 24) this.scheduleClear();
  }

  private scheduleClear() {
    if (this.clearTimer) return;
    this.clearTimer = setTimeout(() => {
      this.clearTimer = null;
      const latest = this.inbox
        .filter((message) => this.seen.has(message.id))
        .reduce((max, message) => Math.max(max, message.at), 0);
      const firstPending = this.inbox
        .filter((message) => !this.seen.has(message.id))
        .reduce((min, message) => Math.min(min, message.at), Infinity);
      if (!latest || firstPending <= latest) return;
      void this.options.backend
        .mutation(api.signals.clear, {
          ...this.creds,
          roomId: this.options.roomId,
          upTo: latest,
        })
        .catch(() => undefined);
    }, 4_000);
  }
}
