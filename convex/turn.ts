import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

type IceServer = { urls: string | string[]; username?: string; credential?: string };

const STUN: IceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
];

export const iceServers = action({
  args: { deviceId: v.string(), deviceSecret: v.string() },
  handler: async (ctx, args): Promise<IceServer[]> => {
    const ok: boolean = await ctx.runQuery(internal.devices.check, args);
    if (!ok) return STUN;

    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
    if (keyId && token) {
      try {
        const res = await fetch(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ttl: 14_400 }),
          },
        );
        if (res.ok) {
          const body = (await res.json()) as { iceServers?: IceServer[] };
          if (Array.isArray(body.iceServers) && body.iceServers.length > 0)
            return body.iceServers;
        }
      } catch {
        return STUN;
      }
    }

    const urls = process.env.TURN_URLS;
    if (urls && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      return [
        ...STUN,
        {
          urls: urls.split(",").map((u) => u.trim()),
          username: process.env.TURN_USERNAME,
          credential: process.env.TURN_CREDENTIAL,
        },
      ];
    }
    return STUN;
  },
});
