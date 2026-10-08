import type { KeyRecord } from "../protocol/crypto";
import type { Platform } from "../protocol/room-controller";
import { idb } from "./idb";
import { sinks } from "./sinks";

const fallback = new Map<string, KeyRecord>();

export const webPlatform: Platform = {
  createConnection: (config) => new RTCPeerConnection(config),
  keys: {
    async get(id) {
      try {
        return (await idb.get<KeyRecord>("keys", id)) ?? fallback.get(id) ?? null;
      } catch {
        return fallback.get(id) ?? null;
      }
    },
    async put(id, record) {
      fallback.set(id, record);
      await idb.put("keys", id, record).catch(() => undefined);
    },
  },
  sinks,
  onWake(callback) {
    const visible = () => {
      if (document.visibilityState === "visible") callback();
    };
    window.addEventListener("online", callback);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", callback);
      document.removeEventListener("visibilitychange", visible);
    };
  },
};

export const handheld = () =>
  window.matchMedia("(pointer: coarse)").matches &&
  (/Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent) || navigator.maxTouchPoints > 1);

export const supported = () =>
  typeof RTCPeerConnection !== "undefined" &&
  typeof crypto !== "undefined" &&
  !!crypto.subtle;
