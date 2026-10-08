import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const via = v.union(
  v.literal("link"),
  v.literal("code"),
  v.literal("nearby"),
);

export const guestState = v.union(
  v.literal("pending"),
  v.literal("admitted"),
  v.literal("declined"),
);

export default defineSchema({
  devices: defineTable({
    deviceId: v.string(),
    secretHash: v.string(),
    name: v.string(),
    lastSeen: v.number(),
  }).index("by_deviceId", ["deviceId"]),

  rooms: defineTable({
    roomId: v.string(),
    hostDeviceId: v.string(),
    hostName: v.string(),
    joinTokenHash: v.string(),
    code: v.string(),
    status: v.union(v.literal("open"), v.literal("closed")),
    visible: v.boolean(),
    netHash: v.optional(v.string()),
    hostSeenAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_roomId", ["roomId"])
    .index("by_code", ["code", "status"])
    .index("by_net", ["netHash", "status"])
    .index("by_expiry", ["expiresAt"]),

  guests: defineTable({
    roomId: v.string(),
    deviceId: v.string(),
    name: v.string(),
    state: guestState,
    via,
    epoch: v.number(),
    commit: v.optional(v.string()),
    hostPub: v.optional(v.string()),
    guestPub: v.optional(v.string()),
    nonce: v.optional(v.string()),
    needsCommit: v.boolean(),
    lastSeen: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_device", ["roomId", "deviceId"]),

  signals: defineTable({
    roomId: v.string(),
    from: v.string(),
    to: v.string(),
    payload: v.string(),
  })
    .index("by_inbox", ["roomId", "to"])
    .index("by_room", ["roomId"]),

  pairs: defineTable({
    owner: v.string(),
    peer: v.string(),
  })
    .index("by_owner_peer", ["owner", "peer"])
    .index("by_peer", ["peer"]),

  rings: defineTable({
    to: v.string(),
    from: v.string(),
    fromName: v.string(),
    sealed: v.string(),
  })
    .index("by_to", ["to"])
    .index("by_from_to", ["from", "to"]),

  limits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  }).index("by_key", ["key"]),

  events: defineTable({
    day: v.string(),
    type: v.string(),
    visitor: v.string(),
    country: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    os: v.optional(v.string()),
    browser: v.optional(v.string()),
    device: v.optional(v.string()),
    referrer: v.optional(v.string()),
    path: v.optional(v.string()),
    kind: v.optional(v.string()),
    ext: v.optional(v.string()),
    bucket: v.optional(v.string()),
    bytes: v.optional(v.number()),
    route: v.optional(v.string()),
    via: v.optional(v.string()),
  }).index("by_day", ["day"]),

  daily: defineTable({
    day: v.string(),
    visits: v.number(),
    rooms: v.number(),
    joins: v.number(),
    files: v.number(),
    bytes: v.number(),
    notes: v.number(),
  }).index("by_day", ["day"]),
});
