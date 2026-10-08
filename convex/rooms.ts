import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { creds } from "./devices";
import { via } from "./schema";
import {
  ID_PATTERN,
  KEY_PATTERN,
  MAX_GUESTS,
  ROOM_TTL_MS,
  bump,
  cleanName,
  fail,
  fromBase64Url,
  getGuest,
  getRoom,
  readNetToken,
  requireDevice,
  safeEqual,
  sha256,
  sha256Hex,
  takeLimit,
  toBase64Url,
} from "./lib";

export const create = mutation({
  args: {
    ...creds,
    roomId: v.string(),
    joinTokenHash: v.string(),
    netToken: v.optional(v.string()),
    visible: v.boolean(),
  },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    if (!ID_PATTERN.test(args.roomId)) fail("bad-room");
    if (!/^[a-f0-9]{64}$/.test(args.joinTokenHash)) fail("bad-room");
    if (!(await takeLimit(ctx, `create:${device.deviceId}`, 60, 3_600_000)))
      fail("slow-down");
    if (await getRoom(ctx, args.roomId)) fail("bad-room");

    let code = "";
    for (let attempt = 0; attempt < 12 && !code; attempt++) {
      const candidate = String(Math.floor(Math.random() * 1_000_000)).padStart(
        6,
        "0",
      );
      const taken = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", candidate).eq("status", "open"))
        .first();
      if (!taken) code = candidate;
    }
    if (!code) fail("busy");

    const now = Date.now();
    const netHash = (await readNetToken(args.netToken)) ?? undefined;
    await ctx.db.insert("rooms", {
      roomId: args.roomId,
      hostDeviceId: device.deviceId,
      hostName: device.name,
      joinTokenHash: args.joinTokenHash,
      code,
      status: "open",
      visible: args.visible,
      netHash,
      hostSeenAt: now,
      expiresAt: now + ROOM_TTL_MS,
    });
    await bump(ctx, "rooms");
    return { code, expiresAt: now + ROOM_TTL_MS };
  },
});

export const view = query({
  args: { ...creds, roomId: v.string() },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    const room = await getRoom(ctx, args.roomId);
    if (!room) return { role: "none" as const, room: null };

    const base = {
      status: room.status,
      expiresAt: room.expiresAt,
      hostName: room.hostName,
      hostDeviceId: room.hostDeviceId,
    };

    if (room.hostDeviceId === device.deviceId) {
      const guests = await ctx.db
        .query("guests")
        .withIndex("by_room", (q) => q.eq("roomId", room.roomId))
        .collect();
      return {
        role: "host" as const,
        room: { ...base, code: room.code, visible: room.visible, nearbyReady: !!room.netHash },
        guests: guests.map((g) => ({
          deviceId: g.deviceId,
          name: g.name,
          state: g.state,
          via: g.via,
          epoch: g.epoch,
          commit: g.commit ?? null,
          hostPub: g.hostPub ?? null,
          guestPub: g.guestPub ?? null,
          nonce: g.nonce ?? null,
        })),
      };
    }

    const me = await getGuest(ctx, room.roomId, device.deviceId);
    if (!me) return { role: "none" as const, room: base };
    return {
      role: "guest" as const,
      room: base,
      me: {
        state: me.state,
        via: me.via,
        epoch: me.epoch,
        commit: me.commit ?? null,
        hostPub: me.hostPub ?? null,
        revealed: !!me.guestPub,
        needsCommit: me.needsCommit,
      },
    };
  },
});

export const lookupCode = mutation({
  args: { ...creds, code: v.string() },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    if (!/^\d{6}$/.test(args.code)) return { roomId: null, limited: false };
    if (!(await takeLimit(ctx, `code:${device.deviceId}`, 12, 600_000)))
      return { roomId: null, limited: true };
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code).eq("status", "open"))
      .first();
    if (!room || room.expiresAt < Date.now())
      return { roomId: null, limited: false };
    return { roomId: room.roomId, limited: false };
  },
});

export const nearby = query({
  args: { ...creds, netToken: v.string() },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    const netHash = await readNetToken(args.netToken);
    if (!netHash) return [];
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_net", (q) => q.eq("netHash", netHash).eq("status", "open"))
      .order("desc")
      .take(24);
    return rooms
      .filter((r) => r.visible && r.hostDeviceId !== device.deviceId)
      .slice(0, 8)
      .map((r) => ({
        roomId: r.roomId,
        hostName: r.hostName,
        hostSeenAt: r.hostSeenAt,
        expiresAt: r.expiresAt,
      }));
  },
});

export const join = mutation({
  args: {
    ...creds,
    roomId: v.string(),
    commit: v.string(),
    joinToken: v.optional(v.string()),
    via,
  },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    if (!KEY_PATTERN.test(args.commit)) fail("bad-key");
    const room = await getRoom(ctx, args.roomId);
    if (!room) fail("not-found");
    if (room.status === "closed") fail("closed");
    if (room.expiresAt < Date.now()) fail("expired");
    if (room.hostDeviceId === device.deviceId) fail("is-host");
    if (!(await takeLimit(ctx, `join:${device.deviceId}`, 40, 600_000)))
      fail("slow-down");

    let linked = false;
    if (args.joinToken) {
      linked = safeEqual(sha256Hex(args.joinToken), room.joinTokenHash);
      if (!linked) fail("bad-link");
    }
    const entry = linked ? "link" : args.via === "link" ? "code" : args.via;
    const now = Date.now();
    const existing = await getGuest(ctx, room.roomId, device.deviceId);
    if (existing) {
      if (existing.state === "declined") fail("declined");
      await ctx.db.patch(existing._id, {
        name: device.name,
        commit: args.commit,
        epoch: existing.epoch + 1,
        hostPub: undefined,
        guestPub: undefined,
        nonce: undefined,
        needsCommit: false,
        state: linked ? "admitted" : "pending",
        via: entry,
        lastSeen: now,
      });
      return { state: linked ? "admitted" : "pending" };
    }

    const guests = await ctx.db
      .query("guests")
      .withIndex("by_room", (q) => q.eq("roomId", room.roomId))
      .collect();
    if (guests.filter((g) => g.state !== "declined").length >= MAX_GUESTS)
      fail("full");
    await ctx.db.insert("guests", {
      roomId: room.roomId,
      deviceId: device.deviceId,
      name: device.name,
      state: linked ? "admitted" : "pending",
      via: entry,
      epoch: 1,
      commit: args.commit,
      needsCommit: false,
      lastSeen: now,
    });
    await bump(ctx, "joins");
    return { state: linked ? "admitted" : "pending" };
  },
});

async function requireHost(
  ctx: Parameters<typeof requireDevice>[0],
  args: { deviceId: string; deviceSecret: string; roomId: string },
) {
  const device = await requireDevice(ctx, args);
  const room = await getRoom(ctx, args.roomId);
  if (!room) fail("not-found");
  if (room.hostDeviceId !== device.deviceId) fail("unauthorized");
  return room;
}

export const setHostKey = mutation({
  args: {
    ...creds,
    roomId: v.string(),
    guestId: v.string(),
    epoch: v.number(),
    hostPub: v.string(),
  },
  handler: async (ctx, args) => {
    await requireHost(ctx, args);
    if (!KEY_PATTERN.test(args.hostPub)) fail("bad-key");
    const guest = await getGuest(ctx, args.roomId, args.guestId);
    if (!guest || guest.epoch !== args.epoch || !guest.commit || guest.hostPub)
      return false;
    await ctx.db.patch(guest._id, { hostPub: args.hostPub });
    return true;
  },
});

export const reveal = mutation({
  args: {
    ...creds,
    roomId: v.string(),
    epoch: v.number(),
    guestPub: v.string(),
    nonce: v.string(),
  },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    if (!KEY_PATTERN.test(args.guestPub) || !KEY_PATTERN.test(args.nonce))
      fail("bad-key");
    const guest = await getGuest(ctx, args.roomId, device.deviceId);
    if (!guest || guest.epoch !== args.epoch || !guest.hostPub || !guest.commit)
      return false;
    const pub = fromBase64Url(args.guestPub);
    const nonce = fromBase64Url(args.nonce);
    const joined = new Uint8Array(pub.length + nonce.length);
    joined.set(pub);
    joined.set(nonce, pub.length);
    if (!safeEqual(toBase64Url(sha256(joined)), guest.commit)) fail("bad-key");
    await ctx.db.patch(guest._id, {
      guestPub: args.guestPub,
      nonce: args.nonce,
    });
    return true;
  },
});

export const requestRekey = mutation({
  args: { ...creds, roomId: v.string(), guestId: v.string() },
  handler: async (ctx, args) => {
    await requireHost(ctx, args);
    const guest = await getGuest(ctx, args.roomId, args.guestId);
    if (!guest || guest.state === "declined") return null;
    await ctx.db.patch(guest._id, {
      epoch: guest.epoch + 1,
      commit: undefined,
      hostPub: undefined,
      guestPub: undefined,
      nonce: undefined,
      needsCommit: true,
      state: guest.via === "link" ? guest.state : "pending",
    });
    return null;
  },
});

export const decide = mutation({
  args: {
    ...creds,
    roomId: v.string(),
    guestId: v.string(),
    epoch: v.number(),
    admit: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireHost(ctx, args);
    const guest = await getGuest(ctx, args.roomId, args.guestId);
    if (!guest) return null;
    if (!args.admit) {
      await ctx.db.patch(guest._id, { state: "declined" });
      return null;
    }
    if (guest.epoch !== args.epoch || !guest.guestPub) fail("stale");
    await ctx.db.patch(guest._id, { state: "admitted" });
    return null;
  },
});

export const leave = mutation({
  args: { ...creds, roomId: v.string() },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    const guest = await getGuest(ctx, args.roomId, device.deviceId);
    if (guest && guest.state !== "declined") await ctx.db.delete(guest._id);
    return null;
  },
});

export const close = mutation({
  args: { ...creds, roomId: v.string() },
  handler: async (ctx, args) => {
    const room = await requireHost(ctx, args);
    await ctx.db.patch(room._id, { status: "closed", visible: false });
    const signals = await ctx.db
      .query("signals")
      .withIndex("by_room", (q) => q.eq("roomId", room.roomId))
      .take(500);
    for (const signal of signals) await ctx.db.delete(signal._id);
    return null;
  },
});

export const setVisible = mutation({
  args: {
    ...creds,
    roomId: v.string(),
    visible: v.boolean(),
    netToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const room = await requireHost(ctx, args);
    const netHash = (await readNetToken(args.netToken)) ?? room.netHash;
    await ctx.db.patch(room._id, { visible: args.visible, netHash });
    return null;
  },
});

export const touch = mutation({
  args: { ...creds, roomId: v.string() },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    const room = await getRoom(ctx, args.roomId);
    if (!room || room.status !== "open") return null;
    const now = Date.now();
    if (room.hostDeviceId === device.deviceId) {
      await ctx.db.patch(room._id, { hostSeenAt: now, hostName: cleanName(device.name) });
      return null;
    }
    const guest = await getGuest(ctx, room.roomId, device.deviceId);
    if (guest) await ctx.db.patch(guest._id, { lastSeen: now });
    return null;
  },
});

export const peek = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const room = await getRoom(ctx, args.roomId);
    if (!room) return null;
    const guests = await ctx.db
      .query("guests")
      .withIndex("by_room", (q) => q.eq("roomId", room.roomId))
      .collect();
    return {
      roomId: room.roomId,
      status: room.status,
      expiresAt: room.expiresAt,
      devices: guests.filter((g) => g.state === "admitted").length,
    };
  },
});
