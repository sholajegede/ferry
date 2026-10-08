import { createHmac } from "node:crypto";

const TOKEN_MS = 12 * 60 * 60 * 1000;

function network(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const raw = (forwarded || headers.get("x-real-ip") || "").replace(/^::ffff:/, "");
  if (!raw || raw === "::1" || raw.startsWith("127.")) return "local";
  if (raw.includes(":")) return raw.split(":").slice(0, 4).join(":");
  return raw;
}

function place(headers: Headers) {
  const read = (name: string) => {
    const value = headers.get(name);
    if (!value) return undefined;
    try {
      return decodeURIComponent(value).slice(0, 48);
    } catch {
      return value.slice(0, 48);
    }
  };
  return {
    c: read("x-vercel-ip-country") ?? read("cf-ipcountry"),
    r: read("x-vercel-ip-country-region"),
    ci: read("x-vercel-ip-city"),
  };
}

export async function GET(request: Request) {
  const secret = process.env.NETWORK_SECRET;
  const headers = { "Cache-Control": "no-store" };
  if (!secret || secret.length < 16) return Response.json({ token: null, geo: null }, { headers });
  const sign = (message: string) => createHmac("sha256", secret).update(message).digest("hex");
  const expires = Date.now() + TOKEN_MS;
  const netHash = sign(`net:${network(request.headers)}`).slice(0, 32);
  const body = Buffer.from(JSON.stringify(place(request.headers))).toString("base64url");
  return Response.json(
    {
      token: `${netHash}.${expires}.${sign(`${netHash}.${expires}`)}`,
      geo: `${body}.${expires}.${sign(`geo:${body}.${expires}`)}`,
    },
    { headers },
  );
}
