// Loads the Chrome extension and checks that it sends to a browser on another device.
// Build it first with: FERRY_TEST_BRIDGE=http://localhost:4455 FERRY_SITE=http://localhost:3000 npm --prefix extension run build
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.E2E_URL ?? "http://localhost:3000";
const photo = path.join(process.env.E2E_FILES ?? ".", "photo.bin");
const extension = path.resolve("extension/dist");
const results = [];
const check = (name, pass, detail = "") => {
  results.push(Boolean(pass));
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const context = await chromium.launchPersistentContext(await mkdtemp(path.join(tmpdir(), "ferry-ext-")), {
  executablePath: process.env.E2E_CHROMIUM || undefined,
  headless: true,
  args: [
    "--headless=new",
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--disable-features=WebRtcHideLocalIpsWithMdns",
    "--allow-loopback-in-peer-connection",
  ],
});
const phoneBrowser = await chromium.launch({
  executablePath: process.env.E2E_CHROMIUM || undefined,
  args: ["--disable-features=WebRtcHideLocalIpsWithMdns", "--allow-loopback-in-peer-connection"],
});

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker", { timeout: 15000 });
  const id = new URL(worker.url()).host;
  check("the extension loads and its service worker starts", Boolean(id), id);

  // The popup page, opened as a tab so the test can drive it.
  const page = await context.newPage();
  await page.goto(`${base}/privacy`);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  // A tab-opened popup sees itself as the active tab, so give it the page to send through the menu path.
  await worker.evaluate(
    (url) => chrome.storage.session.set({ pending: { kind: "page", url, title: "Privacy" }, pendingLabel: "Privacy" }),
    `${base}/privacy`,
  );
  await popup.reload();
  await popup.getByRole("button", { name: "Send with a QR code" }).click();
  const code = (await popup.locator(".code").innerText({ timeout: 15000 })).replace(/\D/g, "");
  const copied = await popup.locator("img[alt='QR code for the transfer link']").count();
  check("the popup shows a QR code and a 6-digit code", copied === 1 && /^\d{6}$/.test(code), code);

  const phone = await (await phoneBrowser.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true })).newPage();
  await phone.goto(base);
  const link = await worker.evaluate(async () => (await chrome.runtime.sendMessage({ to: "offscreen", type: "get" })).job.link);
  await phone.goto(link);
  await phone.getByText(`${base}/privacy`).first().waitFor({ timeout: 20000 });
  check("the phone receives the page link", true);
  await popup.getByText("Delivered.").waitFor({ timeout: 15000 });
  check("the popup says it was delivered", true);

  // The phone that received the link sends a file back. This is what failed before.
  await phone.locator('input[type="file"]').first().setInputFiles(photo);
  await popup.getByText("saved in Downloads").waitFor({ timeout: 30000 });
  const back = await worker.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const [item] = await chrome.downloads.search({ state: "complete" });
      if (item) return { name: item.filename, size: item.fileSize || item.bytesReceived, by: item.byExtensionName };
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return { all: await chrome.downloads.search({}) };
  });
  check("a file sent back from the phone is saved in Downloads", back?.by === "Ferry" && back.size === (await stat(photo)).size, `${back?.size} bytes`);
  const badge = await worker.evaluate(() => chrome.action.getBadgeText({}));
  check("the toolbar icon shows the result", badge === "✓", badge);

  // Receive only: the phone opens the link and sends text.
  await popup.getByRole("button", { name: "Start again" }).click();
  await popup.getByRole("button", { name: "Receive from a phone" }).click();
  await popup.locator(".code").waitFor({ timeout: 15000 });
  const inboxLink = await worker.evaluate(async () => (await chrome.runtime.sendMessage({ to: "offscreen", type: "get" })).job.link);
  await phone.goto(inboxLink);
  await phone.getByLabel("Send text or a link").fill("the wifi password is ferry123");
  await phone.getByRole("button", { name: "Send text" }).click();
  await popup.getByText("the wifi password is ferry123").waitFor({ timeout: 20000 });
  check("text from the phone shows in the popup", true);
  if (process.env.E2E_SHOTS) await popup.screenshot({ path: `${process.env.E2E_SHOTS}/extension-received.png` });

  // Pairing, then a second send that needs no code.
  await popup.getByRole("button", { name: "End" }).click();
  await popup.getByRole("button", { name: "Remember a phone" }).click();
  await popup.locator(".code").waitFor({ timeout: 15000 });
  const pairLink = await worker.evaluate(async () => (await chrome.runtime.sendMessage({ to: "offscreen", type: "get" })).job.link);
  await phone.goto(pairLink);
  try {
    await phone.getByRole("button", { name: /remember|yes/i }).first().click({ timeout: 20000 });
  } catch (error) {
    if (process.env.E2E_SHOTS) await phone.screenshot({ path: `${process.env.E2E_SHOTS}/extension-pair-phone.png`, fullPage: true });
    if (process.env.E2E_SHOTS) await popup.screenshot({ path: `${process.env.E2E_SHOTS}/extension-pair-popup.png` });
    throw error;
  }
  await popup.getByText(/now remember each other/).waitFor({ timeout: 20000 });
  check("the extension and a phone remember each other", true);

  await popup.getByRole("button", { name: "Start again" }).click();
  await worker.evaluate(() => chrome.storage.session.set({ pending: { kind: "text", text: "pick up milk" }, pendingLabel: "pick up milk" }));
  await popup.reload();
  await phone.goto(base);
  await popup.getByRole("button", { name: /^Send to / }).click();
  await phone.getByRole("button", { name: "Receive" }).click({ timeout: 20000 });
  await phone.getByText("pick up milk").first().waitFor({ timeout: 20000 });
  check("a remembered phone receives with no code", true);

  // An image, sent as a file. A data URL needs no site permission.
  await popup.getByRole("button", { name: "Start again" }).click();
  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  await worker.evaluate((url) => chrome.storage.session.set({ pending: { kind: "image", url, name: "dot.png" }, pendingLabel: "dot.png" }), pixel);
  await popup.reload();
  await popup.setViewportSize({ width: 360, height: 520 });
  if (process.env.E2E_SHOTS) await popup.screenshot({ path: `${process.env.E2E_SHOTS}/extension-compose.png` });
  await popup.getByRole("button", { name: "Show a QR code instead" }).click();
  await popup.locator(".code").waitFor({ timeout: 15000 });
  if (process.env.E2E_SHOTS) await popup.screenshot({ path: `${process.env.E2E_SHOTS}/extension-qr.png` });
  const imageLink = await worker.evaluate(async () => (await chrome.runtime.sendMessage({ to: "offscreen", type: "get" })).job.link);
  const download = phone.waitForEvent("download", { timeout: 20000 });
  await phone.goto(imageLink);
  const saved = await download;
  check("an image is sent as a file", saved.suggestedFilename() === "dot.png", saved.suggestedFilename());
  await popup.getByText("Delivered.").waitFor({ timeout: 15000 });
  if (process.env.E2E_SHOTS) await popup.screenshot({ path: `${process.env.E2E_SHOTS}/extension-done.png` });
} catch (error) {
  check(`run completed (${String(error.message).split("\n")[0]})`, false);
} finally {
  await context.close();
  await phoneBrowser.close();
}
console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
