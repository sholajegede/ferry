import { fetchMutation } from "convex/nextjs";
import { cookies } from "next/headers";
import { api } from "../../../../../convex/_generated/api";
import {
  ADMIN_COOKIE,
  adminConfigured,
  clientKey,
  issueSession,
  passwordMatches,
} from "@/lib/server/admin";

export async function POST(request: Request) {
  if (!adminConfigured())
    return Response.json({ error: "The admin page is not set up." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host"))
    return Response.json({ error: "Not allowed." }, { status: 403 });

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    return Response.json({ error: "Enter the password." }, { status: 400 });
  }

  const allowed = await fetchMutation(api.stats.loginAttempt, {
    key: process.env.ANALYTICS_KEY!,
    who: clientKey(request.headers),
  }).catch(() => false);
  if (!allowed)
    return Response.json(
      { error: "Too many attempts. Wait 15 minutes and try again." },
      { status: 429 },
    );

  if (!password || !passwordMatches(password))
    return Response.json({ error: "That password is not correct." }, { status: 401 });

  const session = issueSession(Date.now());
  const store = await cookies();
  store.set(ADMIN_COOKIE, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: session.maxAge,
  });
  return Response.json({ ok: true });
}
