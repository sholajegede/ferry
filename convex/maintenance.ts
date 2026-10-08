import { internalMutation } from "./_generated/server";

export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("rooms")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .take(40);
    for (const room of expired) {
      const guests = await ctx.db
        .query("guests")
        .withIndex("by_room", (q) => q.eq("roomId", room.roomId))
        .take(100);
      for (const guest of guests) await ctx.db.delete(guest._id);
      const signals = await ctx.db
        .query("signals")
        .withIndex("by_room", (q) => q.eq("roomId", room.roomId))
        .take(300);
      for (const signal of signals) await ctx.db.delete(signal._id);
      await ctx.db.delete(room._id);
    }

    const rings = await ctx.db.query("rings").order("asc").take(200);
    for (const ring of rings)
      if (now - ring._creationTime > 600_000) await ctx.db.delete(ring._id);

    const limits = await ctx.db.query("limits").order("asc").take(300);
    for (const limit of limits)
      if (now - limit.windowStart > 7_200_000) await ctx.db.delete(limit._id);

    const cutoff = new Date(now - 120 * 86_400_000).toISOString().slice(0, 10);
    const stale = await ctx.db
      .query("events")
      .withIndex("by_day", (q) => q.lt("day", cutoff))
      .take(500);
    for (const event of stale) await ctx.db.delete(event._id);

    const idle = await ctx.db.query("devices").order("asc").take(200);
    for (const device of idle)
      if (now - device.lastSeen > 90 * 86_400_000) await ctx.db.delete(device._id);
    return null;
  },
});
