import { api } from "../../../convex/_generated/api";
import { randomId } from "../protocol/bytes";
import { joinTokenFor, joinTokenHash, newLinkSecret } from "../protocol/crypto";
import type { FileSource } from "../protocol/types";
import { getBackend, ready } from "./backend";
import { netToken } from "./net";
import { stash } from "./outbox";
import { sealInvite, type PairedDevice } from "./paired";

const ROOM_ID = /^[A-Za-z0-9_-]{16,64}$/;
const SECRET = /^[A-Za-z0-9_-]{40,64}$/;

export function rememberSecret(roomId: string, secret: string) {
  try {
    localStorage.setItem(`ferry.room.${roomId}`, JSON.stringify({ secret, at: Date.now() }));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith("ferry.room.")) continue;
      const entry = JSON.parse(localStorage.getItem(key) ?? "{}") as { at?: number };
      if (!entry.at || Date.now() - entry.at > 2 * 86_400_000) localStorage.removeItem(key);
    }
  } catch {}
}

export function recallSecret(roomId: string): string | null {
  try {
    const entry = JSON.parse(localStorage.getItem(`ferry.room.${roomId}`) ?? "null") as {
      secret?: string;
    } | null;
    return entry?.secret && SECRET.test(entry.secret) ? entry.secret : null;
  } catch {
    return null;
  }
}

export async function createRoom(options: {
  files?: FileSource[];
  note?: string;
  ring?: PairedDevice;
}) {
  const identity = await ready();
  const creds = { deviceId: identity.deviceId, deviceSecret: identity.deviceSecret };
  const backend = getBackend();
  const roomId = randomId(16);
  const secret = newLinkSecret();
  const hash = await joinTokenHash(await joinTokenFor(secret, roomId));
  const net = options.ring ? null : await netToken();
  await backend.mutation(api.rooms.create, {
    ...creds,
    roomId,
    joinTokenHash: hash,
    netToken: net ?? undefined,
    visible: !options.ring && !!net,
  });
  rememberSecret(roomId, secret);
  void backend
    .mutation(api.stats.track, { ...creds, event: "room", via: options.ring ? "paired" : "new" })
    .catch(() => undefined);
  stash({ files: options.files, note: options.note });
  if (options.ring) {
    const sealed = await sealInvite(options.ring, { roomId, secret });
    await backend.mutation(api.pairs.ring, { ...creds, to: options.ring.id, sealed });
  }
  return `/room/${roomId}#k=${secret}`;
}

export function parseInvite(input: string): { path: string } | { offline: string } | null {
  const value = input.trim();
  if (/^F[01]\.[A-Za-z0-9_-]+$/.test(value)) return { offline: value };
  try {
    const url = new URL(value, "https://placeholder.invalid");
    const match = url.pathname.match(/\/room\/([^/]+)\/?$/);
    if (match && ROOM_ID.test(match[1])) {
      const secret = url.hash.startsWith("#k=") ? url.hash.slice(3) : "";
      if (secret && !SECRET.test(secret)) return null;
      return { path: `/room/${match[1]}${secret ? `#k=${secret}` : "?via=code"}` };
    }
    if (url.pathname.replace(/\/$/, "") === "/offline" && url.hash.length > 4)
      return { offline: url.hash.slice(1) };
  } catch {}
  return null;
}
