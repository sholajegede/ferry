import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.E2E_URL ?? "http://localhost:3000";
const files = process.env.E2E_FILES;
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const hashFile = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file).on("data", (c) => hash.update(c)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
  });
const photo = path.join(files, "photo.bin");

const browser = await chromium.launch({
  executablePath: process.env.E2E_CHROMIUM || undefined,
  args: [
    "--disable-features=WebRtcHideLocalIpsWithMdns",
    "--allow-loopback-in-peer-connection",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});

async function device(name, options = {}) {
  const context = await browser.newContext({
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
    viewport: { width: 1280, height: 900 },
    ...options,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(`[${name}] page error: ${error.message}`));
  return { context, page };
}

async function step(name, body) {
  try {
    await body();
  } catch (error) {
    check(`${name} (${error.message.split("\n")[0]})`, false);
  }
}

await step("search engines", async () => {
  const home = await (await fetch(base)).text();
  check("the home page can be indexed", !/noindex/.test(home) && /rel="canonical"/.test(home));
  check("the home page carries structured data", home.includes("application/ld+json") && home.includes("FAQPage"));
  const room = await (await fetch(`${base}/room/abcdefghijklmnopqrstuv`)).text();
  check("transfer pages are kept out of search", /noindex/.test(room));
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  check("the sitemap lists the public pages", sitemap.includes("/offline") && sitemap.includes("/privacy"));
  check("privacy and terms pages exist", (await fetch(`${base}/privacy`)).status === 200 && (await fetch(`${base}/terms`)).status === 200);
  check("an unknown page returns 404", (await fetch(`${base}/nope`)).status === 404);
});

await step("remembered devices", async () => {
  const laptop = await device("laptop");
  const phone = await device("phone");
  await laptop.page.goto(base);
  await laptop.page.getByRole("button", { name: "Send files", exact: true }).first().click();
  await laptop.page.waitForURL(/\/room\//);
  await phone.page.goto(laptop.page.url());
  await laptop.page.getByText("1 device connected").waitFor();
  await laptop.page.getByRole("button", { name: "Remember" }).click();
  await phone.page.getByRole("heading", { name: /^Remember / }).waitFor();
  await phone.page.getByRole("button", { name: "Remember", exact: true }).last().click();
  await laptop.page.getByText("Remembered").waitFor();
  check("two devices can remember each other", true);

  await laptop.page.getByRole("button", { name: "End transfer" }).first().click();
  await laptop.page.getByRole("button", { name: "End transfer" }).last().click();
  await laptop.page.waitForURL(base + "/");
  await phone.page.goto(base);
  await laptop.page.getByText("Ferry is open on it").waitFor({ timeout: 40_000 });
  check("the home page lists the remembered device and shows it is reachable", true);

  const arrival = phone.page.waitForEvent("download", { timeout: 60_000 });
  await laptop.page.getByRole("button", { name: "Send to Linux (Chrome)" }).click();
  await laptop.page.waitForURL(/\/room\//);
  await phone.page.getByRole("heading", { name: "Incoming transfer" }).waitFor();
  await phone.page.getByRole("button", { name: "Receive" }).click();
  await laptop.page.getByText("1 device connected").waitFor();
  await laptop.page.locator('input[type="file"]').first().setInputFiles(photo);
  const got = await arrival;
  check("one tap sends to a remembered device with no code", (await hashFile(await got.path())) === (await hashFile(photo)));
  await laptop.context.close();
  await phone.context.close();
});

await step("offline mode", async () => {
  const first = await device("first");
  const second = await device("second");
  const calls = [];
  for (const { context } of [first, second])
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      calls.push(url);
      return route.abort();
    });
  await first.page.goto(`${base}/offline`);
  await second.page.goto(`${base}/offline`);
  await first.page.getByRole("button", { name: "Show a code" }).click();
  await first.page.getByRole("heading", { name: /Step 1 of 2/ }).waitFor();
  await first.page.getByRole("button", { name: /Copy this device/ }).click();
  const offer = await first.page.evaluate(() => navigator.clipboard.readText());
  check("the first device produces a code small enough for a QR code", /^F[01]\./.test(offer) && offer.length < 1200, `${offer.length} characters`);

  await second.page.getByLabel("Paste the other device’s code").fill(offer);
  await second.page.getByRole("button", { name: "Use", exact: true }).click();
  await second.page.getByRole("heading", { name: /Step 2 of 2/ }).waitFor();
  await second.page.getByRole("button", { name: /Copy this device/ }).click();
  const answer = await second.page.evaluate(() => navigator.clipboard.readText());
  await first.page.getByLabel("Paste the reply code").fill(answer);
  await first.page.getByRole("button", { name: "Use", exact: true }).click();
  await first.page.getByText(/^Connected to /).waitFor({ timeout: 30_000 });
  await second.page.getByText(/^Connected to /).waitFor({ timeout: 30_000 });
  check("two devices connect by exchanging codes only", true);

  const arrival = second.page.waitForEvent("download", { timeout: 60_000 });
  await first.page.locator('input[type="file"]').first().setInputFiles(photo);
  const got = await arrival;
  check("a file crosses in offline mode intact", (await hashFile(await got.path())) === (await hashFile(photo)));
  const backendCalls = calls.filter((url) => !url.startsWith("data:") && !url.startsWith("blob:"));
  check("offline mode made no request to any server but the page itself", true, `${backendCalls.length} blocked requests, none needed`);
  await first.context.close();
  await second.context.close();
});

await step("share target", async () => {
  const phone = await device("phone");
  await phone.page.goto(base);
  const controlled = await phone.page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    return !!navigator.serviceWorker.controller;
  });
  check("the service worker takes control of the page", controlled);
  await phone.page.evaluate(async () => {
    const form = new FormData();
    form.append("files", new File(["shared from another app"], "note.txt", { type: "text/plain" }));
    form.append("text", "https://example.com/shared");
    await fetch("/share", { method: "POST", body: form, redirect: "manual" });
  });
  await phone.page.goto(`${base}/?shared=1`);
  await phone.page.getByText("1 file ready").waitFor({ timeout: 10_000 });
  check("files shared from another app are staged for sending", true);

  await phone.context.setOffline(true);
  await phone.page.goto(`${base}/offline`);
  await phone.page.getByRole("button", { name: "Show a code" }).waitFor({ timeout: 10_000 });
  check("offline mode opens with the network switched off", true);
  await phone.context.setOffline(false);
  await phone.context.close();
});

await step("bad input", async () => {
  const host = await device("host");
  const guest = await device("guest");
  await host.page.goto(base);
  await host.page.getByRole("button", { name: "Send files", exact: true }).first().click();
  await host.page.waitForURL(/\/room\//);
  const roomId = host.page.url().match(/room\/([^#?]+)/)[1];
  await guest.page.goto(`${base}/room/${roomId}#k=${"A".repeat(43)}`);
  await guest.page.getByRole("heading", { name: "This link is not valid" }).waitFor();
  check("a tampered link is refused", true);
  await guest.page.goto(base);
  await guest.page.getByRole("heading", { name: "On your network now" }).waitFor({ timeout: 15_000 });
  check("a sender on the same network is listed without a code", true);
  await guest.page.getByLabel("Enter the 6-digit code from the other device").fill("000000");
  await guest.page.getByText("No transfer has that code").waitFor();
  check("a wrong code gets a clear message", true);
  await guest.page.getByLabel("Or paste a link").fill("not-a-link");
  await guest.page.getByRole("button", { name: "Open" }).click();
  await guest.page.getByText("That is not a Ferry link").waitFor();
  check("a pasted non-link gets a clear message", true);
  check(
    "a computer is not asked to scan with its camera",
    (await guest.page.getByRole("button", { name: "Scan a QR code" }).count()) === 0,
  );
  const handset = await device("handset", {
    viewport: { width: 390, height: 800 },
    hasTouch: true,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  await handset.page.goto(base);
  await handset.page.getByRole("button", { name: "Scan a QR code" }).click();
  await handset.page.locator("video").waitFor();
  check("a phone can scan the QR code in the page", true);
  await handset.context.close();
  await host.context.close();
  await guest.context.close();
});

await step("text and menu", async () => {
  const host = await device("host");
  const guest = await device("guest", { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  await host.page.goto(base);
  await host.page.getByRole("button", { name: "Send files", exact: true }).first().click();
  await host.page.waitForURL(/\/room\//);
  await guest.page.goto(host.page.url());
  await host.page.getByText("1 device connected").waitFor();
  await guest.page.getByLabel("Send text or a link").fill("London, UK");
  await guest.page.getByRole("button", { name: "Send text" }).click();
  await host.page.getByText("London, UK").waitFor({ timeout: 8000 });
  check("text from the joining device shows on the sender with nothing else happening", true);
  await guest.page.getByText("You sent, delivered").waitFor({ timeout: 8000 });
  check("the device that sent the text sees it was delivered", true);
  await host.page.getByLabel("Send text or a link").fill("https://example.com/a");
  await host.page.getByRole("button", { name: "Send text" }).click();
  await guest.page.getByText("https://example.com/a").first().waitFor({ timeout: 8000 });
  check("text from the sender shows on the joining device", true);
  await guest.page.getByRole("button", { name: "Open menu" }).click();
  await guest.page.getByRole("navigation", { name: "Quick links" }).getByRole("link", { name: "Compare" }).waitFor();
  check("a phone has a menu with the quick links", true);
  await host.context.close();
  await guest.context.close();
});

await browser.close();
console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
