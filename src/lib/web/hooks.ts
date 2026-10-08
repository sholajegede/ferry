"use client";

import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Identity } from "../protocol/room-controller";
import { getBackend, hasBackend, ready } from "./backend";
import { onIdentityChange } from "./device";
import { pairedStore } from "./paired";

export function useIdentity() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => {
      if (!hasBackend()) {
        setFailed(true);
        return;
      }
      ready().then(
        (value) => active && setIdentity(value),
        () => active && setFailed(true),
      );
    };
    load();
    const off = onIdentityChange(load);
    return () => {
      active = false;
      off();
    };
  }, []);
  return { identity, failed };
}

export function useLive<Q extends FunctionReference<"query">>(
  ref: Q,
  args: FunctionArgs<Q> | "skip",
): FunctionReturnType<Q> | undefined {
  const [value, setValue] = useState<FunctionReturnType<Q> | undefined>(undefined);
  const key = args === "skip" ? "skip" : JSON.stringify(args);
  useEffect(() => {
    if (key === "skip" || !hasBackend()) return;
    return getBackend().subscribe(ref, JSON.parse(key) as FunctionArgs<Q>, setValue, () => undefined);
  }, [ref, key]);
  return key === "skip" ? undefined : value;
}

export function usePaired() {
  return useSyncExternalStore(pairedStore.subscribe, pairedStore.get, pairedStore.server);
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

const never = () => () => undefined;

export function useClientValue<T extends string | number | boolean | null>(
  read: () => T,
  onServer: T,
): T {
  return useSyncExternalStore(never, read, () => onServer);
}

const flagListeners = new Set<() => void>();

export function useLocalFlag(key: string, fallback: boolean) {
  const value = useSyncExternalStore(
    (listener) => {
      flagListeners.add(listener);
      return () => {
        flagListeners.delete(listener);
      };
    },
    () => {
      try {
        const stored = localStorage.getItem(key);
        return stored === null ? fallback : stored === "1";
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  const set = (next: boolean) => {
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {}
    for (const listener of flagListeners) listener();
  };
  return [value, set] as const;
}
