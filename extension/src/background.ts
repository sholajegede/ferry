import { describe, type Item, type ToBackground } from "./messages";

/**
 * The service worker. It adds the right-click menu, keeps the offscreen page alive while a
 * transfer runs, and shows the state of the transfer on the toolbar icon.
 */

const MENU = [
  { id: "page", title: "Send this page with Ferry", contexts: ["page"] },
  { id: "link", title: "Send this link with Ferry", contexts: ["link"] },
  { id: "image", title: "Send this image with Ferry", contexts: ["image"] },
  { id: "text", title: "Send the selected text with Ferry", contexts: ["selection"] },
] as const;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const entry of MENU) chrome.contextMenus.create({ id: entry.id, title: entry.title, contexts: [...entry.contexts] });
  });
});

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen
    .createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.WEB_RTC],
      justification: "Keeps the connection to the other device open while a transfer runs.",
    })
    .catch(() => undefined);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  let item: Item | null = null;
  if (info.menuItemId === "page" && tab?.url) item = { kind: "page", url: tab.url, title: tab.title ?? tab.url };
  if (info.menuItemId === "link" && info.linkUrl) item = { kind: "link", url: info.linkUrl, title: info.selectionText };
  if (info.menuItemId === "text" && info.selectionText) item = { kind: "text", text: info.selectionText };
  if (info.menuItemId === "image" && info.srcUrl) item = { kind: "image", url: info.srcUrl, name: "" };
  if (!item) return;
  // The popup asks how to send it, so the person chooses a phone or a code.
  void chrome.storage.session.set({ pending: item, pendingLabel: describe(item) }).then(() => chrome.action.openPopup().catch(() => undefined));
});

chrome.runtime.onMessage.addListener((message: ToBackground | { to: "background"; type: "ensure" }, _sender, reply) => {
  if (message?.to !== "background") return;
  if (message.type === "ensure") {
    void ensureOffscreen().then(() => reply(true));
    return true;
  }
  if (message.type === "download") {
    // The offscreen page holds the file. Chrome saves it in the Downloads folder.
    void chrome.downloads.download({ url: message.url, filename: message.filename, conflictAction: "uniquify" }).catch(() =>
      chrome.downloads.download({ url: message.url, conflictAction: "uniquify" }),
    );
    return false;
  }
  if (message.type === "job") {
    const job = message.job;
    const text = !job ? "" : job.status === "done" ? "✓" : job.status === "failed" ? "!" : "•";
    const color = !job || job.status === "done" ? "#007f4a" : job.status === "failed" ? "#b3261e" : "#714bd0";
    void chrome.action.setBadgeText({ text });
    void chrome.action.setBadgeBackgroundColor({ color });
  }
  return false;
});
