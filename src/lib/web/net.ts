type Tokens = { token: string | null; geo: string | null };

let cached: { at: number; value: Promise<Tokens> } | null = null;

function load(): Promise<Tokens> {
  const now = Date.now();
  if (!cached || now - cached.at > 600_000) {
    const value = fetch("/api/net", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : {}))
      .then((body: Partial<Tokens>) => ({ token: body.token ?? null, geo: body.geo ?? null }))
      .catch(() => ({ token: null, geo: null }));
    cached = { at: now, value };
  }
  return cached.value;
}

export const netToken = () => load().then((tokens) => tokens.token);
export const geoToken = () => load().then((tokens) => tokens.geo);

export function deviceContext() {
  const agent = navigator.userAgent;
  const tablet = /iPad|Tablet/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
  const phone = !tablet && /iPhone|Android.+Mobile|Mobile/.test(agent);
  const os = /iPhone|iPad|iPod/.test(agent) || tablet && /Macintosh/.test(agent)
    ? "iOS"
    : /Android/.test(agent)
      ? "Android"
      : /Windows/.test(agent)
        ? "Windows"
        : /CrOS/.test(agent)
          ? "ChromeOS"
          : /Mac OS X/.test(agent)
            ? "macOS"
            : /Linux/.test(agent)
              ? "Linux"
              : "Other";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /OPR\//.test(agent)
      ? "Opera"
      : /SamsungBrowser/.test(agent)
        ? "Samsung"
        : /Firefox\/|FxiOS/.test(agent)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(agent)
            ? "Chrome"
            : /Safari\//.test(agent)
              ? "Safari"
              : "Other";
  return { os, browser, device: phone ? "Phone" : tablet ? "Tablet" : "Computer" };
}
