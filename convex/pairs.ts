import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { creds } from "./devices";
import { ID_PATTERN, fail, requireDevice, takeLimit } from "./lib";
import type { MutationCtx, QueryCtx } from "./_generated/server";

async function findPair(ctx: QueryCtx | MutationCtx, owner: string, peer: string) {
  return await ctx.db
    .query("pairs")
    .withIndex("by_owner_peer", (q) => q.eq("owner", owner).eq("peer", peer))
    .unique();
}

export const link = mutation({
  args: { ...creds, peer: v.string() },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    if (!ID_PATTERN.test(args.peer) || args.peer === device.deviceId)
      fail("bad-device");
    if (!(await findPair(ctx, device.deviceId, args.peer)))
      await ctx.db.insert("pairs", { owner: device.deviceId, peer: args.peer });
    return null;
  },
});

export const unlink = mutation({
  args: { ...creds, peer: v.string() },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    const mine = await findPair(ctx, device.deviceId, args.peer);
    if (mine) await ctx.db.delete(mine._id);
    const theirs = await findPair(ctx, args.peer, device.deviceId);
    if (theirs) await ctx.db.delete(theirs._id);
    return null;
  },
});

export const status = query({
  args: { ...creds, peers: v.array(v.string()) },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    const out: { peer: string; linked: boolean; name: string | null; lastSeen: number }[] = [];
    for (const peer of args.peers.slice(0, 24)) {
      const mine = await findPair(ctx, device.deviceId, peer);
      const theirs = await findPair(ctx, peer, device.deviceId);
      const linked = !!mine && !!theirs;
      const other = linked
        ? await ctx.db
            .query("devices")
            .withIndex("by_deviceId", (q) => q.eq("deviceId", peer))
            .unique()
        : null;
      out.push({
        peer,
        linked,
        name: other?.name ?? null,
        lastSeen: other?.lastSeen ?? 0,
      });
    }
    return out;
  },
});

export const ring = mutation({
  args: { ...creds, to: v.string(), sealed: v.string() },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    if (args.sealed.length > 2048) fail("too-large");
    const mine = await findPair(ctx, device.deviceId, args.to);
    const theirs = await findPair(ctx, args.to, device.deviceId);
    if (!mine || !theirs) fail("not-paired");
    if (!(await takeLimit(ctx, `ring:${device.deviceId}`, 30, 600_000)))
      fail("slow-down");
    const older = await ctx.db
      .query("rings")
      .withIndex("by_from_to", (q) =>
        q.eq("from", device.deviceId).eq("to", args.to),
      )
      .collect();
    for (const row of older) await ctx.db.delete(row._id);
    await ctx.db.insert("rings", {
      to: args.to,
      from: device.deviceId,
      fromName: device.name,
      sealed: args.sealed,
    });
    return null;
  },
});

export const incoming = query({
  args: creds,
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    const rows = await ctx.db
      .query("rings")
      .withIndex("by_to", (q) => q.eq("to", device.deviceId))
      .order("desc")
      .take(5);
    return rows.map((r) => ({
      id: r._id,
      from: r.from,
      fromName: r.fromName,
      sealed: r.sealed,
      at: r._creationTime,
    }));
  },
});

export const dismiss = mutation({
  args: { ...creds, ringId: v.id("rings") },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    const row = await ctx.db.get(args.ringId);
    if (row && row.to === device.deviceId) await ctx.db.delete(row._id);
    return null;
  },
});
