import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "ferry_admin";
const SESSION_MS = 12 * 60 * 60 * 1000;

export function adminConfigured() {
  return (
    (process.env.ADMIN_PASSWORD ?? "").length >= 12 &&
    (process.env.ANALYTICS_KEY ?? "").length >= 16 &&
    !!process.env.NEXT_PUBLIC_CONVEX_URL
  );
}

function sessionKey() {
  return createHash("sha256")
    .update(`session:${process.env.ADMIN_PASSWORD}:${process.env.ANALYTICS_KEY}`)
    .digest();
}

function sign(expires: string) {
  return createHmac("sha256", sessionKey()).update(expires).digest("hex");
}

export function passwordMatches(candidate: string) {
  const expected = createHash("sha256").update(process.env.ADMIN_PASSWORD ?? "").digest();
  const actual = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(expected, actual);
}

export function issueSession(now: number) {
  const expires = String(now + SESSION_MS);
  return { value: `${expires}.${sign(expires)}`, maxAge: SESSION_MS / 1000 };
}

export function sessionValid(value: string | undefined, now = Date.now()) {
  if (!value || !adminConfigured()) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < now) return false;
  const expected = Buffer.from(sign(expires));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function clientKey(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`admin:${ip}`).digest("hex").slice(0, 24);
}
