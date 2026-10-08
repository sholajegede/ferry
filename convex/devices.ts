import { v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";
import {
  ID_PATTERN,
  cleanName,
  fail,
  findDevice,
  requireDevice,
  safeEqual,
  sha256Hex,
} from "./lib";

export const creds = { deviceId: v.string(), deviceSecret: v.string() };

export const register = mutation({
  args: { ...creds, name: v.string() },
  handler: async (ctx, args) => {
    if (!ID_PATTERN.test(args.deviceId)) fail("bad-device");
    if (args.deviceSecret.length < 32 || args.deviceSecret.length > 128)
      fail("bad-device");
    const secretHash = sha256Hex(args.deviceSecret);
    const existing = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .unique();
    const name = cleanName(args.name);
    if (existing) {
      if (!safeEqual(existing.secretHash, secretHash)) fail("unauthorized");
      await ctx.db.patch(existing._id, { name, lastSeen: Date.now() });
      return null;
    }
    await ctx.db.insert("devices", {
      deviceId: args.deviceId,
      secretHash,
      name,
      lastSeen: Date.now(),
    });
    return null;
  },
});

export const heartbeat = mutation({
  args: creds,
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    await ctx.db.patch(device._id, { lastSeen: Date.now() });
    return null;
  },
});

export const check = internalQuery({
  args: creds,
  handler: async (ctx, args) => {
    return (await findDevice(ctx, args)) !== null;
  },
});
