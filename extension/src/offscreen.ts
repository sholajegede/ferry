import { ConvexClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { bridgeBackend } from "../../src/lib/protocol/bridge-backend";
import { randomId } from "../../src/lib/protocol/bytes";
import { joinTokenFor, joinTokenHash, newLinkSecret, type KeyRecord } from "../../src/lib/protocol/crypto";
import { RoomController, type Backend, type Identity, type Platform } from "../../src/lib/protocol/room-controller";
import type { FileSource, SinkProvider } from "../../src/lib/protocol/types";
import { addPaired, pairedStore, sealInvite } from "../../src/lib/web/paired";
import { textOf, type Item, type Job, type ToOffscreen } from "./messages";

/**
 * The engine. It runs in an offscreen page, because a popup closes as soon as it loses focus
 * and would take the transfer with it. This page stays open until the transfer ends.
 */

declare const __SERVER__: string;
declare const __SITE__: string;
declare const __BRIDGE__: string;

const SITE = __SITE__.replace(/\/$/, "");

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

/** The extension only sends, so it refuses any file another device offers it. */
const refuse: SinkProvider = {
  open: async () => {
    throw new Error("This device only sends.");
  },
  progress: () => undefined,
  complete: async () => undefined,
  discard: async () => undefined,
};

const keys = new Map<string, KeyRecord>();
const platform: Platform = {
  createConnection: (config) => new RTCPeerConnection(config),
  keys: { get: async (id) => keys.get(id) ?? null, put: async (id, record) => void keys.set(id, record) },
  sinks: refuse,
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
  const fromUrl = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "").replace(/[^\w.() -]/g, "");
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
  if (!running) return;
  for (const timer of running.timers) clearTimeout(timer);
  await running.controller.close().catch(() => undefined);
  await running.controller.stop().catch(() => undefined);
  running.close();
}

async function begin(item: Item | null, ringId?: string) {
  await stop();
  const me = identity();
  const creds = { deviceId: me.deviceId, deviceSecret: me.deviceSecret };
  const ring = ringId ? pairedStore.get().find((device) => device.id === ringId) : undefined;
  publish({ id: randomId(8), item, pairing: item === null, status: "starting", ringing: ring?.name });

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
    let noteSent = false;
    let finished = false;
    let joinedOnce = false;
    const finish = (status: "done" | "failed", message: string) => {
      if (finished) return;
      finished = true;
      update({ status, message, progress: status === "done" ? 1 : job?.progress });
      // The other device keeps the transfer open so the person can read the text or save the image.
      // It closes when that device leaves, or after ten minutes.
      timers.push(window.setTimeout(() => void stop(), status === "done" ? 10 * 60_000 : 1500));
    };

    controller.onEvent((event) => {
      if (event.type === "joined") {
        update({ status: "connected", device: event.name });
        if (text && !noteSent) noteSent = controller.sendNote(text);
        if (item === null) timers.push(window.setTimeout(() => controller.askToPair(event.peerId), 1200));
      }
      if (event.type === "pair-ask") controller.answerPair(event.peerId, item === null);
      if (event.type === "paired") {
        addPaired(event.peerId, event.name, event.seed);
        finish("done", `This browser and ${event.name} now remember each other.`);
      }
      if (event.type === "pair-declined") finish("failed", `${event.name} did not agree to be remembered.`);
    });
    controller.subscribe(() => {
      const state = controller.getState();
      if (["missing", "closed", "expired", "error"].includes(state.phase) && !finished) {
        finish("failed", "The transfer ended before anything was delivered.");
        return;
      }
      const present = state.peers.some((peer) => peer.status !== "approval");
      if (present) joinedOnce = true;
      if (finished && joinedOnce && !present) void stop();
      if (text && !noteSent && state.peers.some((peer) => peer.status === "connected")) noteSent = controller.sendNote(text);
      if (text && state.notes.some((note) => note.direction === "out" && note.delivered)) finish("done", "Delivered.");
      const out = state.transfers.filter((transfer) => transfer.direction === "out");
      if (source && out.length > 0) {
        const transfer = out[0];
        if (transfer.status === "done") finish("done", "Delivered.");
        else if (transfer.status === "failed" || transfer.status === "cancelled") finish("failed", "The image was not delivered.");
        else update({ status: "sending", progress: transfer.size ? transfer.bytes / transfer.size : 0 });
      }
    });
    if (source) await controller.share([source]);
    controller.start();
    update({ status: "waiting", link: `${SITE}/room/${roomId}#k=${secret}`, code: room.code });
    // A transfer that nobody opens closes by itself.
    timers.push(window.setTimeout(() => !finished && finish("failed", "Nobody opened the transfer in time."), 15 * 60_000));
  } catch (error) {
    update({ status: "failed", message: error instanceof Error ? error.message : "Something went wrong." });
    await stop();
  }
}

chrome.runtime.onMessage.addListener((message: ToOffscreen, _sender, reply) => {
  if (message?.to !== "offscreen") return;
  if (message.type === "get") reply({ job });
  else if (message.type === "send") void begin(message.item, message.ring);
  else if (message.type === "pair") void begin(null);
  else if (message.type === "stop") void stop().then(() => publish(null));
  return false;
});
