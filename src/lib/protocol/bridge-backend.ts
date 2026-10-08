import { getFunctionName } from "convex/server";
import type { Backend } from "./room-controller";

export function bridgeBackend(url: string): Backend {
  const post = async (kind: string, name: string, args: unknown) => {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({ kind, name, args }),
    });
    const body = await response.json();
    if (body.error) throw Object.assign(new Error("Request failed"), { data: body.error });
    return body.value;
  };
  return {
    mutation: (ref, args) => post("mutation", getFunctionName(ref), args),
    action: (ref, args) => post("action", getFunctionName(ref), args),
    subscribe: (ref, args, onValue, onError) => {
      let last = "";
      let stopped = false;
      const tick = async () => {
        if (stopped) return;
        try {
          const value = await post("query", getFunctionName(ref), args);
          const text = JSON.stringify(value);
          if (!stopped && text !== last) {
            last = text;
            onValue(value);
          }
        } catch (error) {
          onError?.(error);
        }
        if (!stopped) setTimeout(tick, 120);
      };
      void tick();
      return () => {
        stopped = true;
      };
    },
  };
}
