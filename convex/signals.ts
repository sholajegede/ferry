import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { creds } from "./devices";
import { MAX_SIGNAL_BYTES, fail, getGuest, getRoom, requireDevice } from "./lib";

export const send = mutation({
  args: { ...creds, roomId: v.string(), to: v.string(), payload: v.string() },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    if (args.payload.length > MAX_SIGNAL_BYTES) fail("too-large");
    const room = await getRoom(ctx, args.roomId);
    if (!room || room.status !== "open") fail("closed");
    const fromHost = room.hostDeviceId === device.deviceId;
    const guestId = fromHost ? args.to : device.deviceId;
    if (!fromHost && args.to !== room.hostDeviceId) fail("unauthorized");
    const guest = await getGuest(ctx, room.roomId, guestId);
    if (!guest || guest.state !== "admitted") fail("unauthorized");
    await ctx.db.insert("signals", {
      roomId: room.roomId,
      from: device.deviceId,
      to: args.to,
      payload: args.payload,
    });
    return null;
  },
});

export const inbox = query({
  args: { ...creds, roomId: v.string() },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    const rows = await ctx.db
      .query("signals")
      .withIndex("by_inbox", (q) =>
        q.eq("roomId", args.roomId).eq("to", device.deviceId),
      )
      .take(200);
    return rows.map((r) => ({
      id: r._id,
      from: r.from,
      payload: r.payload,
      at: r._creationTime,
    }));
  },
});

export const clear = mutation({
  args: { ...creds, roomId: v.string(), upTo: v.number() },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    const rows = await ctx.db
      .query("signals")
      .withIndex("by_inbox", (q) =>
        q.eq("roomId", args.roomId).eq("to", device.deviceId),
      )
      .take(200);
    for (const row of rows)
      if (row._creationTime <= args.upTo) await ctx.db.delete(row._id);
    return null;
  },
});
