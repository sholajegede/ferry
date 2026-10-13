/** What the extension can send, and the messages between its parts. */

export type Item =
  | { kind: "page"; url: string; title: string }
  | { kind: "link"; url: string; title?: string }
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; name: string };

export type JobStatus = "starting" | "waiting" | "connected" | "sending" | "done" | "failed";

export type Job = {
  id: string;
  /** What is being sent. Empty for a pairing job. */
  item: Item | null;
  pairing: boolean;
  status: JobStatus;
  link?: string;
  code?: string;
  /** The remembered device that was asked to receive. */
  ringing?: string;
  device?: string;
  progress?: number;
  message?: string;
};

export type ToOffscreen =
  | { to: "offscreen"; type: "send"; item: Item; ring?: string }
  | { to: "offscreen"; type: "pair" }
  | { to: "offscreen"; type: "stop" }
  | { to: "offscreen"; type: "get" };

export type ToPopup = { to: "popup"; type: "job"; job: Job | null };

export type ToBackground = { to: "background"; type: "job"; job: Job | null };

/** The text a phone receives for a page or a link. */
export function textOf(item: Item): string {
  if (item.kind === "text") return item.text;
  if (item.kind === "page" || item.kind === "link") return item.title && item.title !== item.url ? `${item.title}\n${item.url}` : item.url;
  return item.url;
}

export function describe(item: Item): string {
  if (item.kind === "page") return item.title || item.url;
  if (item.kind === "link") return item.title || item.url;
  if (item.kind === "text") return item.text.length > 120 ? `${item.text.slice(0, 117)}…` : item.text;
  return item.name;
}
