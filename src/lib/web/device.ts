import { randomId } from "../protocol/bytes";
import type { Identity } from "../protocol/room-controller";

const KEY = "ferry.device";
const listeners = new Set<() => void>();
let cached: Identity | null = null;

function defaultName() {
  const agent = navigator.userAgent;
  const system = /iPhone/.test(agent)
    ? "iPhone"
    : /iPad/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)
      ? "iPad"
      : /Android/.test(agent)
        ? "Android"
        : /Windows/.test(agent)
          ? "Windows"
          : /Mac OS X/.test(agent)
            ? "Mac"
            : /CrOS/.test(agent)
              ? "Chromebook"
              : /Linux/.test(agent)
                ? "Linux"
                : "Device";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /OPR\//.test(agent)
      ? "Opera"
      : /Firefox\//.test(agent)
        ? "Firefox"
        : /Chrome\//.test(agent)
          ? "Chrome"
          : /Safari\//.test(agent)
            ? "Safari"
            : "Browser";
  return `${system} (${browser})`;
}

export function getIdentity(): Identity {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Identity;
      if (parsed.deviceId && parsed.deviceSecret && parsed.name) {
        cached = parsed;
        return parsed;
      }
    }
  } catch {}
  cached = { deviceId: randomId(16), deviceSecret: randomId(32), name: defaultName() };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {}
  return cached;
}

export function renameDevice(name: string) {
  const next = { ...getIdentity(), name: name.trim().slice(0, 40) || defaultName() };
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  for (const listener of listeners) listener();
  return next;
}

export function onIdentityChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
