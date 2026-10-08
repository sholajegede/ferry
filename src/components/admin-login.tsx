"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="max-w-sm rounded-[20px] border border-sea bg-paper p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
          });
          if (response.ok) {
            setPassword("");
            router.refresh();
          } else {
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            setError(body.error ?? "Sign-in failed. Try again.");
          }
        } catch {
          setError("Could not reach the server. Try again.");
        }
        setBusy(false);
      }}
    >
      <label htmlFor="admin-password" className="font-semibold">
        Admin password
      </label>
      <input
        id="admin-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="mt-2 h-11 w-full rounded-[12px] border border-sea bg-paper px-3"
      />
      {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
      <Button type="submit" className="mt-4" disabled={busy || !password}>
        {busy ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}

export function AdminSignOut() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
