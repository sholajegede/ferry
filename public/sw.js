const VERSION = "ferry-v1";
const SHELL = `${VERSION}-shell`;
const SHARE = "ferry-share";
const PAGES = ["/", "/offline"];

async function cachePage(cache, path) {
  const response = await fetch(path, { cache: "reload" });
  if (!response.ok) return;
  const html = await response.clone().text();
  await cache.put(path, response);
  const assets = new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g) ?? []);
  await Promise.all(
    [...assets].map(async (url) => {
      try {
        const asset = await fetch(url);
        if (asset.ok) await cache.put(url, asset);
      } catch {}
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => Promise.all(PAGES.map((page) => cachePage(cache, page))))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== SHELL && name !== SHARE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARE);
    let index = 0;
    for (const file of form.getAll("files")) {
      if (!(file instanceof File)) continue;
      await cache.put(
        `/__share/file-${Date.now()}-${index++}`,
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-Last-Modified": String(file.lastModified),
          },
        }),
      );
    }
    const text = ["title", "text", "url"]
      .map((key) => form.get(key))
      .filter((value) => typeof value === "string" && value.trim())
      .join("\n");
    if (text) await cache.put("/__share/text", new Response(text));
  } catch {}
  return Response.redirect("/?shared=1", 303);
}

const OFFLINE_PAGE =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>Ferry is offline</title>" +
  '<body style="margin:0;background:#fcf9f5;color:#714bd0;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh">' +
  '<div style="max-width:28rem;padding:24px"><h1>No connection</h1>' +
  '<p>This page needs the internet. To send files on the same Wi-Fi without internet, open <a href="/offline">offline mode</a>.</p></div></html>';

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === "POST" && url.pathname === "/share") {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        try {
          const response = await fetch(request);
          if (response.ok && PAGES.includes(url.pathname))
            event.waitUntil(cachePage(cache, url.pathname).catch(() => undefined));
          return response;
        } catch {
          const cached = await cache.match(url.pathname);
          if (cached) return cached;
          return new Response(OFFLINE_PAGE, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        const cached = await cache.match(request, { ignoreVary: true });
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) event.waitUntil(cache.put(request, response.clone()));
        return response;
      })(),
    );
  }
});
