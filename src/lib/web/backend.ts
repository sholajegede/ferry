import { ConvexClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { bridgeBackend } from "../protocol/bridge-backend";
import type { Backend, Identity } from "../protocol/room-controller";
import { getIdentity, onIdentityChange } from "./device";
import { deviceContext, geoToken } from "./net";

const bridge = process.env.NEXT_PUBLIC_TEST_BRIDGE;
let instance: Backend | null = null;
let registered: Promise<Identity> | null = null;

function live(url: string): Backend {
  const client = new ConvexClient(url);
  return {
    mutation: (ref, args) => client.mutation(ref, args),
    action: (ref, args) => client.action(ref, args),
    subscribe: (ref, args, onValue, onError) =>
      client.onUpdate(ref, args, onValue, onError),
  };
}

export function hasBackend() {
  return !!(bridge || process.env.NEXT_PUBLIC_CONVEX_URL);
}

function withContext(inner: Backend): Backend {
  return {
    ...inner,
    mutation: async (ref, args) => {
      if (getFunctionName(ref) !== getFunctionName(api.stats.track)) return inner.mutation(ref, args);
      const geo = await geoToken();
      return inner.mutation(ref, { ...args, ...deviceContext(), geo: geo ?? undefined });
    },
  };
}

export function getBackend(): Backend {
  if (!instance) {
    if (bridge) instance = withContext(bridgeBackend(bridge));
    else if (process.env.NEXT_PUBLIC_CONVEX_URL)
      instance = withContext(live(process.env.NEXT_PUBLIC_CONVEX_URL));
    else throw new Error("The app is not connected to its backend yet.");
  }
  return instance;
}

function register() {
  const identity = getIdentity();
  return getBackend()
    .mutation(api.devices.register, identity)
    .then(() => identity);
}

export function ready(): Promise<Identity> {
  if (!registered) {
    registered = register();
    registered.catch(() => {
      registered = null;
    });
  }
  return registered;
}

if (typeof window !== "undefined")
  onIdentityChange(() => {
    registered = register();
    registered.catch(() => {
      registered = null;
    });
  });
