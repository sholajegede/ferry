import { ConvexClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { bridgeBackend } from "../../src/lib/protocol/bridge-backend";
import { randomId } from "../../src/lib/protocol/bytes";
import { joinTokenFor, joinTokenHash, newLinkSecret, type KeyRecord } from "../../src/lib/protocol/crypto";
import { RoomController, type Backend, type Identity, type Platform } from "../../src/lib/protocol/room-controller";
import type { FileMeta, FileSource, SinkProvider } from "../../src/lib/protocol/types";
import { addPaired, pairedStore, sealInvite } from "../../src/lib/web/paired";
import { textOf, type Item, type Job, type Mode, type ToOffscreen } from "./messages";

/**
 * The engine. It runs in an offscreen page, because a popup closes as soon as it loses focus
 * and would take the transfer with it. This page stays open until the transfer ends.
 */

declare const __SERVER__: string;
declare const __SITE__: string;
declare const __BRIDGE__: string;

const SITE = __SITE__.replace(/\/$/, "");
/** Received files are held in memory until they are saved, so there is a limit. */
const MAX_RECEIVE = 2_000_000_000;

function backend(): { backend: Backend; close: () => void } {
  if (__BRIDGE__) return { backend: bridgeBackend(__BRIDGE__), close: () => undefined };
  const client = new ConvexClient(__SERVER__);
  return {
    backend: {
      mutation: (ref, args) => client.mutation(ref, args),
      action: (ref, args) => client.action(ref, args),
      subscribe: (ref, args, onValue, onError) => client.onUpdate(ref, args, onValue, onError),
    },
    close: () => void Promise.resolve(client.close()).catch(() => undefined),
  };
}

function identity(): Identity {
  try {
    const stored = JSON.parse(localStorage.getItem("ferry.identity") ?? "null") as Identity | null;
    if (stored?.deviceId && stored.deviceSecret) return stored;
  } catch {}
  const platform = /Mac/.test(navigator.userAgent) ? "Mac" : /Windows/.test(navigator.userAgent) ? "Windows" : /CrOS/.test(navigator.userAgent) ? "Chromebook" : "Linux";
  const created = { deviceId: randomId(16), deviceSecret: randomId(32), name: `Chrome on ${platform}` };
  localStorage.setItem("ferry.identity", JSON.stringify(created));
  return created;
}

/**
 * Files that arrive are kept in memory, then handed to Chrome's downloads, which saves them
 * in the Downloads folder. A file that would not fit in memory is refused before it starts.
 */
const incoming = new Map<string, { parts: Array<{ at: number; data: Uint8Array }>; received: number }>();
const keyOf = (peerId: string, meta: FileMeta) => `${peerId}:${meta.id}`;

const downloads: SinkProvider = {
  async open(peerId, meta) {
    if (meta.size > MAX_RECEIVE) throw new DOMException("Too large to hold in the browser", "QuotaExceededError");
    const key = keyOf(peerId, meta);
    const entry = incoming.get(key) ?? { parts: [], received: 0 };
    incoming.set(key, entry);
    return {
      offset: entry.received,
      sink: {
        async write(at, data) {
          entry.parts.push({ at, data: data.slice() });
          entry.received = Math.max(entry.received, at + data.byteLength);
        },
        async close() {},
        async abort() {
          incoming.delete(key);
        },
      },
    };
  },
  progress: () => undefined,
  async complete(peerId, meta) {
    const key = keyOf(peerId, meta);
    const entry = incoming.get(key);
    incoming.delete(key);
    if (!entry) return;
    const blob = new Blob(
      entry.parts.sort((a, b) => a.at - b.at).map((part) => part.data as BlobPart),
      { type: meta.type || "application/octet-stream" },
    );
    const url = URL.createObjectURL(blob);
    const filename = (meta.path ?? meta.name).replace(/^\/+/, "").replace(/\.\.+\//g, "");
    await chrome.runtime.sendMessage({ to: "background", type: "download", url, filename }).catch(() => undefined);
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    if (job) update({ received: [...job.received, { kind: "file", name: filename, size: meta.size }] });
  },
  async discard(peerId, meta) {
    incoming.delete(keyOf(peerId, meta));
  },
};

const keys = new Map<string, KeyRecord>();
const platform: Platform = {
  createConnection: (config) => new RTCPeerConnection(config),
  keys: { get: async (id) => keys.get(id) ?? null, put: async (id, record) => void keys.set(id, record) },
  sinks: downloads,
};

function sourceOf(blob: Blob, name: string): FileSource {
  return {
    name,
    size: blob.size,
    type: blob.type || "application/octet-stream",
    lastModified: Date.now(),
    read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
  };
}

function imageName(url: string, type: string) {
  const fromUrl = url.startsWith("data:") ? "" : decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "").replace(/[^\w.() -]/g, "");
  if (/\.\w{2,5}$/.test(fromUrl)) return fromUrl.slice(-80);
  const ext = type.split("/")[1]?.replace("jpeg", "jpg").replace(/\+.*/, "") || "png";
  return `${fromUrl || "image"}.${ext}`.slice(-80);
}

let job: Job | null = null;
let current: { controller: RoomController; close: () => void; timers: number[] } | null = null;

function publish(next: Job | null) {
  job = next;
  void chrome.runtime.sendMessage({ to: "popup", type: "job", job }).catch(() => undefined);
  void chrome.runtime.sendMessage({ to: "background", type: "job", job }).catch(() => undefined);
}

const update = (patch: Partial<Job>) => job && publish({ ...job, ...patch });

async function stop() {
  const running = current;
  current = null;
  incoming.clear();
  if (!running) return;
  for (const timer of running.timers) clearTimeout(timer);
  await running.controller.close().catch(() => undefined);
  await running.controller.stop().catch(() => undefined);
  running.close();
}

async function begin(mode: Mode, item: Item | null, ringId?: string) {
  await stop();
  const me = identity();
  const creds = { deviceId: me.deviceId, deviceSecret: me.deviceSecret };
  const ring = ringId ? pairedStore.get().find((device) => device.id === ringId) : undefined;
  publish({ id: randomId(8), mode, item, received: [], status: "starting", ringing: ring?.name });

  try {
    // Read an image first, so a failure shows before a link is handed out.
    let source: FileSource | null = null;
    if (item?.kind === "image") {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error("Ferry could not read that image.");
      const blob = await response.blob();
      source = sourceOf(blob, item.name || imageName(item.url, blob.type));
    }

    const { backend: server, close } = backend();
    await server.mutation(api.devices.register, me);
    const roomId = randomId(16);
    const secret = newLinkSecret();
    const room = await server.mutation(api.rooms.create, {
      ...creds,
      roomId,
      joinTokenHash: await joinTokenHash(await joinTokenFor(secret, roomId)),
      visible: false,
    });
    if (ring) {
      await server.mutation(api.pairs.ring, { ...creds, to: ring.id, sealed: await sealInvite(ring, { roomId, secret }) });
    }

    const controller = new RoomController({ backend: server, platform, identity: me, roomId, linkSecret: secret, via: "link" });
    const timers: number[] = [];
    current = { controller, close, timers };
    const text = item && item.kind !== "image" ? textOf(item) : null;
    const seenNotes = new Set<string>();
    let noteSent = false;
    let finished = false;
    let joinedOnce = false;

    const finish = (status: "done" | "failed", message: string) => {
      if (finished) return;
      finished = true;
      update({ status, message, progress: status === "done" ? 1 : job?.progress });
      // The other device keeps the transfer open so the person can read the text, save the image,
      // or send something back. It closes when that device leaves, or after ten minutes.
      timers.push(window.setTimeout(() => void stop(), status === "done" ? 10 * 60_000 : 1500));
    };

    controller.onEvent((event) => {
      if (event.type === "joined") {
        joinedOnce = true;
        update({ status: job?.status === "starting" || job?.status === "waiting" ? "connected" : job?.status, device: event.name });
        if (text && !noteSent) noteSent = controller.sendNote(text);
        if (mode === "pair") timers.push(window.setTimeout(() => controller.askToPair(event.peerId), 1200));
      }
      if (event.type === "note" && event.note.direction === "in" && !seenNotes.has(event.note.id) && job) {
        seenNotes.add(event.note.id);
        const from = controller.getState().peers.find((peer) => peer.id === event.note.peerId)?.name ?? "the other device";
        update({ received: [...job.received, { kind: "text", text: event.note.text, from }] });
      }
      if (event.type === "pair-ask") controller.answerPair(event.peerId, mode === "pair");
      if (event.type === "paired") {
        addPaired(event.peerId, event.name, event.seed);
        finish("done", `This browser and ${event.name} now remember each other.`);
      }
      if (event.type === "pair-declined" && mode === "pair") finish("failed", `${event.name} did not agree to be remembered.`);
    });

    controller.subscribe(() => {
      const state = controller.getState();
      if (["missing", "closed", "expired", "error"].includes(state.phase)) {
        if (!finished) finish(job?.received.length ? "done" : "failed", job?.received.length ? "The other device ended the transfer." : "The transfer ended before anything was delivered.");
        return;
      }
      const present = state.peers.some((peer) => peer.status !== "approval");
      if (present) joinedOnce = true;
      if (joinedOnce && !present && (finished || mode === "receive")) {
        if (!finished) finish(job?.received.length ? "done" : "failed", job?.received.length ? "The other device left." : "The other device left before sending anything.");
        else void stop();
        return;
      }
      if (text && !noteSent && state.peers.some((peer) => peer.status === "connected")) noteSent = controller.sendNote(text);
      if (text && state.notes.some((note) => note.direction === "out" && note.delivered)) finish("done", "Delivered.");

      const out = state.transfers.filter((transfer) => transfer.direction === "out");
      if (source && out.length > 0 && !finished) {
        const transfer = out[0];
        if (transfer.status === "done") finish("done", "Delivered.");
        else if (transfer.status === "failed" || transfer.status === "cancelled") finish("failed", "The image was not delivered.");
        else update({ status: "sending", progress: transfer.size ? transfer.bytes / transfer.size : 0 });
      }
      const into = state.transfers.filter((transfer) => transfer.direction === "in" && !["done", "cancelled", "failed"].includes(transfer.status));
      if (into.length > 0 && !finished) {
        const total = into.reduce((sum, transfer) => sum + transfer.size, 0);
        const bytes = into.reduce((sum, transfer) => sum + transfer.bytes, 0);
        update({ status: "receiving", progress: total ? bytes / total : 0 });
      } else if (job?.status === "receiving" && !finished) update({ status: "connected" });
    });

    if (source) await controller.share([source]);
    controller.start();
    update({ status: "waiting", link: `${SITE}/room/${roomId}#k=${secret}`, code: room.code });
    // A transfer that nobody opens closes by itself.
    timers.push(window.setTimeout(() => !joinedOnce && !finished && finish("failed", "Nobody opened the transfer in time."), 15 * 60_000));
  } catch (error) {
    update({ status: "failed", message: error instanceof Error ? error.message : "Something went wrong." });
    await stop();
  }
}

chrome.runtime.onMessage.addListener((message: ToOffscreen, _sender, reply) => {
  if (message?.to !== "offscreen") return;
  if (message.type === "get") reply({ job });
  else if (message.type === "send") void begin("send", message.item, message.ring);
  else if (message.type === "pair") void begin("pair", null);
  else if (message.type === "receive") void begin("receive", null);
  else if (message.type === "stop") void stop().then(() => publish(null));
  return false;
});
