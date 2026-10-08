import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { creds } from "./devices";
import {
  bump,
  dayKey,
  label,
  readGeoToken,
  requireDevice,
  safeEqual,
  sha256Hex,
  takeLimit,
} from "./lib";

const EVENT_CAP = 12_000;

export const track = mutation({
  args: {
    ...creds,
    event: v.union(
      v.literal("visit"),
      v.literal("room"),
      v.literal("join"),
      v.literal("file"),
      v.literal("note"),
      v.literal("pair"),
      v.literal("offline"),
    ),
    bytes: v.optional(v.number()),
    kind: v.optional(v.string()),
    ext: v.optional(v.string()),
    bucket: v.optional(v.string()),
    route: v.optional(v.string()),
    via: v.optional(v.string()),
    path: v.optional(v.string()),
    referrer: v.optional(v.string()),
    os: v.optional(v.string()),
    browser: v.optional(v.string()),
    device: v.optional(v.string()),
    geo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args);
    if (!(await takeLimit(ctx, `track:${device.deviceId}`, 600, 3_600_000))) return null;
    const now = Date.now();
    const day = dayKey(now);
    const bytes =
      args.event === "file" ? Math.max(0, Math.min(Math.round(args.bytes ?? 0), 2 ** 44)) : undefined;

    if (args.event === "visit") await bump(ctx, "visits");
    if (args.event === "file") await bump(ctx, "files", bytes ?? 0);
    if (args.event === "note") await bump(ctx, "notes");

    const place = readGeoToken(args.geo);
    await ctx.db.insert("events", {
      day,
      type: args.event,
      visitor: sha256Hex(`${device.deviceId}:${day}:${process.env.NETWORK_SECRET ?? ""}`).slice(0, 16),
      country: label(place?.country, 2),
      region: label(place?.region, 8),
      city: label(place?.city),
      os: label(args.os, 16),
      browser: label(args.browser, 16),
      device: label(args.device, 12),
      referrer: label(args.referrer, 64),
      path: label(args.path, 64),
      kind: label(args.kind, 16),
      ext: label(args.ext, 8),
      bucket: label(args.bucket, 20),
      bytes,
      route: label(args.route, 8),
      via: label(args.via, 8),
    });
    return null;
  },
});

function keyOk(key: string) {
  const expected = process.env.ANALYTICS_KEY;
  return !!expected && expected.length >= 16 && safeEqual(expected, key);
}

type Counter = Map<string, number>;
const count = (map: Counter, key: string | undefined, by = 1) => {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + by);
};
const top = (map: Counter, limit = 12) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));

export const summary = query({
  args: { key: v.string(), days: v.number() },
  handler: async (ctx, args) => {
    if (!keyOk(args.key)) return null;
    const days = Math.max(1, Math.min(Math.round(args.days), 90));
    const now = Date.now();
    const start = dayKey(now - (days - 1) * 86_400_000);

    const allDaily = await ctx.db.query("daily").withIndex("by_day").order("desc").take(400);
    const totals = { visits: 0, rooms: 0, joins: 0, files: 0, bytes: 0, notes: 0 };
    for (const row of allDaily) {
      totals.visits += row.visits;
      totals.rooms += row.rooms;
      totals.joins += row.joins;
      totals.files += row.files;
      totals.bytes += row.bytes;
      totals.notes += row.notes;
    }

    const events = await ctx.db
      .query("events")
      .withIndex("by_day", (q) => q.gte("day", start))
      .order("desc")
      .take(EVENT_CAP);

    const series = new Map<
      string,
      { day: string; visits: number; visitors: Set<string>; rooms: number; joins: number; files: number; bytes: number }
    >();
    for (let i = days - 1; i >= 0; i--) {
      const day = dayKey(now - i * 86_400_000);
      series.set(day, { day, visits: 0, visitors: new Set(), rooms: 0, joins: 0, files: 0, bytes: 0 });
    }

    const visitors = new Set<string>();
    const senders = new Set<string>();
    const countries: Counter = new Map();
    const cities: Counter = new Map();
    const systems: Counter = new Map();
    const browsers: Counter = new Map();
    const devices: Counter = new Map();
    const referrers: Counter = new Map();
    const pages: Counter = new Map();
    const kinds: Counter = new Map();
    const kindBytes: Counter = new Map();
    const extensions: Counter = new Map();
    const buckets: Counter = new Map();
    const routes: Counter = new Map();
    const joins: Counter = new Map();
    const range = { visits: 0, rooms: 0, joins: 0, files: 0, bytes: 0, notes: 0, pairs: 0, offline: 0 };

    for (const event of events) {
      const slot = series.get(event.day);
      visitors.add(event.visitor);
      switch (event.type) {
        case "visit":
          range.visits++;
          if (slot) {
            slot.visits++;
            slot.visitors.add(event.visitor);
          }
          count(countries, event.country);
          count(cities, event.city && event.country ? `${event.city}, ${event.country}` : undefined);
          count(systems, event.os);
          count(browsers, event.browser);
          count(devices, event.device);
          count(referrers, event.referrer ?? "Direct");
          count(pages, event.path);
          break;
        case "room":
          range.rooms++;
          if (slot) slot.rooms++;
          senders.add(event.visitor);
          break;
        case "join":
          range.joins++;
          if (slot) slot.joins++;
          count(joins, event.via);
          break;
        case "file":
          range.files++;
          range.bytes += event.bytes ?? 0;
          if (slot) {
            slot.files++;
            slot.bytes += event.bytes ?? 0;
          }
          count(kinds, event.kind);
          count(kindBytes, event.kind, event.bytes ?? 0);
          count(extensions, event.ext ? `.${event.ext}` : "no extension");
          count(buckets, event.bucket);
          count(routes, event.route);
          break;
        case "note":
          range.notes++;
          break;
        case "pair":
          range.pairs++;
          break;
        case "offline":
          range.offline++;
          break;
      }
    }

    return {
      days,
      truncated: events.length >= EVENT_CAP,
      totals,
      range: { ...range, visitors: visitors.size, senders: senders.size },
      series: [...series.values()].map((slot) => ({
        day: slot.day,
        visits: slot.visits,
        visitors: slot.visitors.size,
        rooms: slot.rooms,
        joins: slot.joins,
        files: slot.files,
        bytes: slot.bytes,
      })),
      countries: top(countries, 15),
      cities: top(cities, 15),
      systems: top(systems),
      browsers: top(browsers),
      devices: top(devices),
      referrers: top(referrers),
      pages: top(pages),
      kinds: top(kinds, 14).map((entry) => ({ ...entry, bytes: kindBytes.get(entry.name) ?? 0 })),
      extensions: top(extensions, 20),
      buckets: top(buckets),
      routes: top(routes),
      joins: top(joins),
      recent: events.slice(0, 40).map((event) => ({
        at: event._creationTime,
        type: event.type,
        country: event.country ?? null,
        city: event.city ?? null,
        os: event.os ?? null,
        device: event.device ?? null,
        kind: event.kind ?? null,
        ext: event.ext ?? null,
        bytes: event.bytes ?? null,
        route: event.route ?? null,
        via: event.via ?? null,
        path: event.path ?? null,
      })),
    };
  },
});

export const loginAttempt = mutation({
  args: { key: v.string(), who: v.string() },
  handler: async (ctx, args) => {
    if (!keyOk(args.key)) return false;
    return await takeLimit(ctx, `admin:${args.who}`, 5, 900_000);
  },
});
