import QRCode from "qrcode";
import { pairedStore, removePaired } from "../../src/lib/web/paired";
import { describe, type Item, type Job, type ToPopup } from "./messages";

declare const __SITE__: string;
const SITE = __SITE__.replace(/\/$/, "");

const app = document.getElementById("app")!;
(document.getElementById("open") as HTMLAnchorElement).href = SITE;

let job: Job | null = null;
let item: Item | null = null;
let pendingFromMenu = false;
let qr = "";

const h = (tag: string, props: Record<string, string> = {}, ...children: Array<Node | string | null | false>) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
};

const button = (label: string, onClick: () => void, kind = "") => {
  const node = h("button", { class: kind, type: "button" }, label) as HTMLButtonElement;
  node.addEventListener("click", onClick);
  return node;
};

const send = (message: unknown) => chrome.runtime.sendMessage(message).catch(() => undefined);

/** An image on another site can only be read after the person allows that site. */
async function allowed(next: Item) {
  if (next.kind !== "image" || next.url.startsWith("data:") || next.url.startsWith("blob:")) return true;
  const origin = `${new URL(next.url).origin}/*`;
  return chrome.permissions.request({ origins: [origin] }).catch(() => false);
}

async function start(ring?: string) {
  if (!item) return;
  if (!(await allowed(item))) return render("Ferry needs permission to read that image. Try again and choose Allow.");
  await chrome.storage.session.remove(["pending", "pendingLabel"]);
  pendingFromMenu = false;
  send({ to: "offscreen", type: "send", item, ring });
}

function statusLine(current: Job) {
  if (current.status === "done") return current.message ?? "Delivered.";
  if (current.status === "failed") return current.message ?? "That did not work.";
  if (current.status === "starting") return "Starting";
  if (current.status === "sending") return `Sending to ${current.device ?? "the other device"}`;
  if (current.status === "connected") return current.pairing ? `Connected to ${current.device}. Accept on that device.` : `Connected to ${current.device}`;
  if (current.ringing) return `Waiting for ${current.ringing}`;
  return "Waiting for the other device";
}

function jobView(current: Job) {
  const tone = current.status === "done" ? "done" : current.status === "failed" ? "failed" : "";
  const card = h(
    "section",
    { class: "card" },
    h("p", { class: "eyebrow" }, current.pairing ? "Remember a phone" : "Sending"),
    current.item ? h("p", { class: "what" }, describe(current.item)) : h("p", { class: "what" }, "Open the link on your phone. The two devices will remember each other."),
  );
  const showCode = current.link && !current.ringing && (current.status === "waiting" || current.status === "starting");
  if (showCode && qr) {
    card.append(
      h(
        "div",
        { class: "qr", style: "margin-top:12px" },
        h("img", { src: qr, alt: "QR code for the transfer link" }),
        h("span", { class: "code" }, `${current.code?.slice(0, 3)} ${current.code?.slice(3)}`),
        h("p", { class: "note" }, `Scan it with the phone, or type the code at ${SITE.replace(/^https?:\/\//, "")}`),
      ),
    );
  }
  if (current.ringing && current.status === "waiting") {
    card.append(h("p", { class: "note", style: "margin-top:10px" }, `${current.ringing} gets a prompt when Ferry is open on it. Nothing is stored on a server.`));
  }
  const status = h("p", { class: `status ${tone}`, style: "margin-top:12px" }, h("span", { class: "dot" }), statusLine(current));
  card.append(status);
  if (current.status === "sending") {
    card.append(h("div", { class: "bar", style: "margin-top:8px" }, h("i", { style: `width:${Math.round((current.progress ?? 0) * 100)}%` })));
  }
  const actions = h("div", { class: "row", style: "margin-top:12px" });
  if (current.link && (current.status === "waiting" || current.status === "starting")) {
    actions.append(button("Copy link", () => void navigator.clipboard.writeText(current.link!).then(() => render("Link copied.")), "small"));
  }
  if (current.status === "done" || current.status === "failed") actions.append(button("Send something else", () => send({ to: "offscreen", type: "stop" }), "small primary"));
  else actions.append(button("End", () => send({ to: "offscreen", type: "stop" }), "small"));
  card.append(actions);
  return card;
}

function composeView(notice?: string) {
  const devices = pairedStore.get();
  const nodes: Node[] = [];
  if (item) {
    nodes.push(
      h(
        "section",
        { class: "card" },
        h("p", { class: "eyebrow" }, item.kind === "page" ? "This page" : item.kind === "image" ? "This image" : item.kind === "text" ? "Selected text" : "This link"),
        h("p", { class: "what" }, describe(item)),
        item.kind === "page" || item.kind === "link" ? h("p", { class: "sub" }, item.url) : null,
      ),
    );
    const list = h("div", { class: "devices" });
    for (const device of devices) {
      list.append(
        h(
          "div",
          { class: "device" },
          button(`Send to ${device.name}`, () => void start(device.id), "primary"),
          button("Forget", () => (removePaired(device.id), render()), "forget"),
        ),
      );
    }
    list.append(button(devices.length ? "Show a QR code instead" : "Send with a QR code", () => void start(), devices.length ? "" : "primary"));
    nodes.push(list);
    if (pendingFromMenu)
      nodes.push(
        button("Send this page instead", () => {
          void chrome.storage.session.remove(["pending", "pendingLabel"]).then(() => load());
        }, "small"),
      );
  } else {
    nodes.push(h("p", { class: "note" }, "Open a normal web page to send it. Chrome pages cannot be sent."));
  }
  nodes.push(
    h(
      "div",
      { class: "row" },
      button("Send files", () => void chrome.tabs.create({ url: SITE })),
      button("Remember a phone", () => send({ to: "offscreen", type: "pair" })),
    ),
  );
  if (notice) nodes.push(h("p", { class: "note" }, notice));
  nodes.push(h("p", { class: "lock" }, "End-to-end encrypted. Nothing is uploaded."));
  return nodes;
}

async function render(notice?: string) {
  if (job?.link && !job.ringing) qr = await QRCode.toDataURL(job.link, { margin: 1, width: 392, color: { dark: "#2f1b63", light: "#ffffff" } });
  app.replaceChildren(...(job ? [jobView(job)] : composeView(notice)));
  if (job && notice) app.append(h("p", { class: "note" }, notice));
}

async function load() {
  const stored = await chrome.storage.session.get(["pending"]);
  pendingFromMenu = Boolean(stored.pending);
  if (stored.pending) item = stored.pending as Item;
  else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    item = tab?.url && /^https?:/.test(tab.url) ? { kind: "page", url: tab.url, title: tab.title ?? tab.url } : null;
  }
  await render();
}

chrome.runtime.onMessage.addListener((message: ToPopup) => {
  if (message?.to !== "popup") return;
  job = message.job;
  void render();
});

void (async () => {
  await chrome.runtime.sendMessage({ to: "background", type: "ensure" }).catch(() => undefined);
  const reply = (await chrome.runtime.sendMessage({ to: "offscreen", type: "get" }).catch(() => null)) as { job: Job | null } | null;
  job = reply?.job ?? null;
  await load();
})();
