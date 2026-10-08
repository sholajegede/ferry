import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { toBase64Url } from "./lib";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function token(bytes: number) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

const http = httpRouter();

http.route({
  path: "/v1/rooms",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: cors })),
});

http.route({
  path: "/v1/rooms",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let body: { roomId?: unknown; joinTokenHash?: unknown; name?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Send a JSON body." }, 400);
    }
    if (typeof body.joinTokenHash !== "string" || !/^[a-f0-9]{64}$/.test(body.joinTokenHash))
      return json({ error: "joinTokenHash must be a SHA-256 hex string." }, 400);

    const deviceId = token(16);
    const deviceSecret = token(32);
    if (typeof body.roomId !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(body.roomId))
      return json({ error: "roomId must be 16 random bytes in base64url." }, 400);
    const roomId = body.roomId;
    try {
      await ctx.runMutation(api.devices.register, {
        deviceId,
        deviceSecret,
        name: typeof body.name === "string" ? body.name : "API client",
      });
      const room = await ctx.runMutation(api.rooms.create, {
        deviceId,
        deviceSecret,
        roomId,
        joinTokenHash: body.joinTokenHash,
        visible: false,
      });
      return json({ roomId, code: room.code, expiresAt: room.expiresAt, deviceId, deviceSecret }, 201);
    } catch {
      return json({ error: "Could not create the room." }, 500);
    }
  }),
});

http.route({
  pathPrefix: "/v1/rooms/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const roomId = new URL(request.url).pathname.split("/").pop() ?? "";
    const room = await ctx.runQuery(api.rooms.peek, { roomId });
    if (!room) return json({ error: "Room not found." }, 404);
    return json(room);
  }),
});

export default http;
