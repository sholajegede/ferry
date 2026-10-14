// Renders the share images in public/og/ with Chromium. Run: npm run og
// Each page gets its own picture of what the page is about, in the site's colours and fonts.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const font = (p) => pathToFileURL(path.join(root, "node_modules", p)).href;
const host = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ferry.sholajegede.com").replace(/^https?:\/\//, "").replace(/\/$/, "");

const c = {
  paper: "#fcf9f5", sunken: "#f1ecfd", sea: "#714bd0", deep: "#4f2f9b", night: "#2f1b63", lilac: "#dfd8ff",
  mint: "#cae4d4", forest: "#00512f", signal: "#007f4a", peach: "#ffd9bf", orange: "#c05100", pink: "#ffcfe3", magenta: "#c2338a", line: "#d6cbf3",
};

const tones = {
  purple: { bg: c.sea, ink: c.paper, soft: c.lilac, accent: c.peach },
  night: { bg: c.night, ink: c.paper, soft: c.lilac, accent: c.mint },
  mint: { bg: c.mint, ink: c.forest, soft: c.signal, accent: c.forest },
  peach: { bg: c.peach, ink: "#6b2d00", soft: c.orange, accent: c.orange },
  lilac: { bg: c.lilac, ink: c.night, soft: c.sea, accent: c.sea },
  cream: { bg: c.paper, ink: c.deep, soft: c.sea, accent: c.sea },
  pink: { bg: c.pink, ink: "#5c0f3c", soft: c.magenta, accent: c.magenta },
};

const mark = (color) => `<svg width="46" height="46" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14.5" stroke="${color}" stroke-width="2"/><path d="M8 14h16l-2.2 5.2a2.6 2.6 0 0 1-2.4 1.6h-6.8a2.6 2.6 0 0 1-2.4-1.6z" fill="${color}"/><path d="M12.5 14v-3a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3" stroke="${color}" stroke-width="2"/></svg>`;
const boat = (fill, size = 40) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32"><path d="M5 15h22l-3 7a3.4 3.4 0 0 1-3.2 2.2h-9.6A3.4 3.4 0 0 1 8 22z" fill="${fill}"/><path d="M11.5 15v-4a1.3 1.3 0 0 1 1.3-1.3h6.4a1.3 1.3 0 0 1 1.3 1.3v4" stroke="${fill}" stroke-width="2.4" fill="none"/></svg>`;
const tick = (color) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const cross = (color) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const lock = (color) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;

/** A QR-looking pattern. It is drawn from a fixed seed, so the image is the same on every run. */
function qr(size, dark, seed = 7) {
  const n = 21, cell = size / n;
  let s = seed, out = "";
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const finder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let on;
    if (finder(x, y)) {
      const fx = x >= n - 7 ? x - (n - 7) : x, fy = y >= n - 7 ? y - (n - 7) : y;
      on = fx === 0 || fy === 0 || fx === 6 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4);
    } else on = rnd() > 0.52;
    if (on) out += `<rect x="${(x * cell).toFixed(2)}" y="${(y * cell).toFixed(2)}" width="${(cell + 0.3).toFixed(2)}" height="${(cell + 0.3).toFixed(2)}" rx="${(cell * 0.18).toFixed(2)}"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="${dark}">${out}</svg>`;
}

const css = (t) => `
@font-face{font-family:Sans;src:url(${font("@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2")});font-weight:100 900}
@font-face{font-family:Serif;src:url(${font("@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2")});font-weight:200 800}
@font-face{font-family:Serif;font-style:italic;src:url(${font("@fontsource-variable/newsreader/files/newsreader-latin-wght-italic.woff2")});font-weight:200 800}
@font-face{font-family:Mono;src:url(${font("@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2")});font-weight:100 800}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:${t.bg};color:${t.ink};font-family:Sans;position:relative;-webkit-font-smoothing:antialiased}
.top{position:absolute;left:60px;right:60px;top:52px;display:flex;align-items:center;justify-content:space-between;z-index:5}
.logo{display:flex;align-items:center;gap:12px;font-size:40px;font-weight:600;letter-spacing:-0.04em}
.eyebrow{font:700 17px/1 Mono;letter-spacing:.16em;text-transform:uppercase;border:2px solid ${t.ink};border-radius:999px;padding:12px 20px}
.copy{position:absolute;left:60px;top:150px;width:560px;z-index:5}
h1{font-weight:600;font-size:70px;line-height:.98;letter-spacing:-0.045em}
h1 em{font-family:Serif;font-style:italic;font-weight:400;letter-spacing:-0.03em}
.sub{font-family:Serif;font-size:29px;line-height:1.28;margin-top:22px;color:${t.soft};max-width:520px}
.foot{position:absolute;left:60px;bottom:46px;display:flex;align-items:center;gap:10px;z-index:5}
.chip{font:700 15px/1 Mono;letter-spacing:.12em;text-transform:uppercase;padding:12px 16px;border-radius:999px;background:${t.ink};color:${t.bg}}
.host{position:absolute;right:60px;bottom:52px;font:600 20px Sans;opacity:.85;z-index:5}
.art{position:absolute;right:0;top:0;bottom:0;width:560px}
.card{position:absolute;background:${c.paper};color:${c.deep};border-radius:28px;box-shadow:0 30px 60px -24px rgba(20,10,50,.45)}
.mono{font-family:Mono}
.blob{position:absolute;border-radius:50%}
`;

const page = (t, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css(t)}</style></head><body>${body}</body></html>`;

const frame = (t, { eyebrow, title, sub, chips = [], art }) =>
  page(t, `
  <div class="top"><div class="logo">${mark(t.ink)}ferry</div><div class="eyebrow">${eyebrow}</div></div>
  <div class="copy"><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div>
  <div class="foot">${chips.map((x) => `<span class="chip">${x}</span>`).join("")}</div>
  <div class="host">${host}</div>
  <div class="art">${art}</div>`);

// The picture on the right of each card.
const phone = (x, y, w, h, inner, rot = 0) =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg);background:#14101f;border-radius:${w * 0.17}px;padding:9px;box-shadow:0 30px 60px -20px rgba(10,5,30,.6)"><div style="width:100%;height:100%;border-radius:${w * 0.14}px;background:${c.paper};overflow:hidden;position:relative;padding:28px 16px 16px;color:${c.deep}"><div style="position:absolute;top:9px;left:50%;width:54px;height:15px;margin-left:-27px;border-radius:9px;background:#14101f"></div>${inner}</div></div>`;

const fileRow = (name, size, tone = c.sea, done = true) =>
  `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid ${c.line};border-radius:16px;background:#fff"><div style="width:38px;height:38px;border-radius:10px;background:${tone};display:flex;align-items:center;justify-content:center;color:#fff;font:700 11px Mono">${name.split(".").pop().toUpperCase().slice(0, 4)}</div><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div><div style="font-size:13px;color:${c.sea};margin-top:2px">${size}</div></div>${done ? tick(c.signal) : ""}</div>`;

const art = {
  home: () => `
    <div class="blob" style="width:520px;height:520px;right:-120px;top:-60px;background:${c.deep};opacity:.55"></div>
    <div class="card" style="left:30px;top:150px;width:330px;padding:22px;transform:rotate(-3deg)">
      <div class="mono" style="font-size:12px;letter-spacing:.14em;color:${c.sea};font-weight:700">SENT FROM IPHONE</div>
      <div style="display:grid;gap:10px;margin-top:14px">${fileRow("IMG_2041.HEIC", "4.2 MB · sent", c.magenta)}${fileRow("trip-video.mov", "1.8 GB · sent", c.orange)}${fileRow("contract.pdf", "320 KB · sent", c.sea)}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:14px;color:${c.sea}">${lock(c.sea)} End-to-end encrypted, code 482 107</div>
    </div>
    ${phone(370, 120, 160, 320, `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:8px">${qr(110, c.night, 3)}<div style="font-size:24px;font-weight:600;letter-spacing:-.03em;color:${c.sea}">482 107</div><div style="font-size:11px;text-align:center;color:${c.sea}">Scan to connect</div></div>`, 4)}
    <svg style="position:absolute;left:250px;top:430px" width="200" height="90" viewBox="0 0 200 90" fill="none"><path d="M6 20 C 60 90, 140 90, 194 20" stroke="${c.lilac}" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/></svg>
    <div style="position:absolute;left:322px;top:478px">${boat(c.peach, 52)}</div>`,

  room: () => `
    <div class="blob" style="width:560px;height:560px;right:-150px;top:30px;background:${c.paper};opacity:.6"></div>
    ${phone(170, 118, 225, 420, `
      <div class="mono" style="font-size:11px;letter-spacing:.14em;color:${c.sea};font-weight:700">INCOMING</div>
      <div style="font-size:24px;font-weight:600;letter-spacing:-.03em;line-height:1.05;margin-top:8px">Your files are on their way</div>
      <div style="display:grid;gap:9px;margin-top:16px">${fileRow("holiday-photos.zip", "Receiving · 64%", c.magenta, false)}${fileRow("notes.txt", "Received", c.sea)}</div>
      <div style="height:9px;border-radius:9px;background:${c.sunken};margin-top:14px;overflow:hidden"><div style="width:64%;height:100%;background:${c.sea};border-radius:9px"></div></div>
      <div style="display:flex;align-items:center;gap:7px;margin-top:16px;font-size:13px;color:${c.sea}">${lock(c.sea)} Only your two devices can read it</div>`, -3)}
    <div style="position:absolute;left:50px;top:170px;transform:rotate(-8deg)">${boat(c.sea, 86)}</div>`,

  offline: () => `
    <svg style="position:absolute;left:60px;top:80px" width="440" height="480" viewBox="0 0 440 480" fill="none" opacity=".25"><circle cx="220" cy="250" r="90" stroke="${c.lilac}" stroke-width="2"/><circle cx="220" cy="250" r="150" stroke="${c.lilac}" stroke-width="2"/><circle cx="220" cy="250" r="210" stroke="${c.lilac}" stroke-width="2"/></svg>
    ${phone(70, 130, 180, 360, `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:12px"><div class="mono" style="font-size:10px;letter-spacing:.14em;color:${c.sea};font-weight:700">SCAN ME</div>${qr(130, c.night, 11)}<div style="font-size:12px;color:${c.sea}">Step 1 of 2</div></div>`, -6)}
    ${phone(300, 110, 180, 360, `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:12px"><div class="mono" style="font-size:10px;letter-spacing:.14em;color:${c.sea};font-weight:700">NOW SCAN THIS</div>${qr(130, c.night, 29)}<div style="font-size:12px;color:${c.sea}">Step 2 of 2</div></div>`, 5)}
    <div style="position:absolute;left:205px;top:505px;display:flex;align-items:center;gap:10px;background:${c.mint};color:${c.forest};border-radius:999px;padding:12px 20px;font:700 15px Mono;letter-spacing:.1em">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c.forest}" stroke-width="2.6" stroke-linecap="round"><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1.2" fill="${c.forest}"/></svg>SAME WI-FI, NO INTERNET</div>`,

  developers: () => `
    <div class="card" style="left:20px;top:125px;width:500px;background:#14101f;color:#e9e4f7;padding:0;overflow:hidden;transform:rotate(-2deg)">
      <div style="display:flex;gap:8px;padding:16px 18px;background:#221a38"><i style="width:12px;height:12px;border-radius:50%;background:#ff6b62"></i><i style="width:12px;height:12px;border-radius:50%;background:#f5b94a"></i><i style="width:12px;height:12px;border-radius:50%;background:#3ecf8e"></i></div>
      <pre class="mono" style="padding:22px 24px;font-size:18px;line-height:1.6;white-space:pre-wrap">${[
        `<span style="color:${c.mint}">$</span> npx ferry-send send report.pdf`,
        `<span style="color:#9c8fd0">Link  ferry.sholajegede.com/room/…</span>`,
        `<span style="color:#9c8fd0">Code  </span><span style="color:${c.peach}">482 107</span>`,
        ``,
        `<span style="color:#9c8fd0">iPhone (Safari) connected</span>`,
        `1/1 files, 2.4 MB of 2.4 MB (100%)`,
        `<span style="color:${c.mint}">The file was delivered.</span>`,
      ].join("\n")}</pre>
    </div>
    <div style="position:absolute;left:280px;top:455px;background:${c.forest};color:${c.mint};border-radius:18px;padding:16px 20px;font:600 16px Mono;white-space:nowrap;transform:rotate(3deg);box-shadow:0 20px 40px -20px rgba(0,40,20,.6)">POST /v1/rooms → 201</div>`,

  agents: () => `
    <div class="card" style="left:30px;top:100px;width:500px;padding:22px 24px;transform:rotate(-2deg)">
      <div class="mono" style="font-size:12px;letter-spacing:.14em;color:${c.orange};font-weight:700">TOOL CALL</div>
      <pre class="mono" style="font-size:17px;line-height:1.55;margin-top:10px;color:${c.night};white-space:pre-wrap">send_files({ paths: ["q3-report.pdf"] })
<span style="color:${c.orange}">→</span> { link: "ferry…/room/…", code: "482107" }</pre>
    </div>
    <div style="position:absolute;left:60px;top:300px;width:400px;background:${c.night};color:${c.paper};border-radius:26px 26px 26px 8px;padding:20px 24px;font-size:21px;line-height:1.35;box-shadow:0 24px 50px -20px rgba(20,10,50,.5)">Your report is ready. Open this link on your phone and it will arrive there.</div>
    <div style="position:absolute;left:250px;top:450px;width:270px;background:#fff;color:${c.deep};border-radius:26px 26px 8px 26px;padding:16px 20px;font-size:19px;box-shadow:0 24px 50px -20px rgba(20,10,50,.4);display:flex;align-items:center;gap:10px">${tick(c.signal)} q3-report.pdf received</div>`,

  extension: () => `
    <div class="card" style="left:20px;top:115px;width:480px;height:400px;padding:0;overflow:hidden;background:#fff">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:${c.sunken}"><i style="width:11px;height:11px;border-radius:50%;background:#d6cbf3"></i><i style="width:11px;height:11px;border-radius:50%;background:#d6cbf3"></i><i style="width:11px;height:11px;border-radius:50%;background:#d6cbf3"></i>
        <div style="flex:1;margin-left:8px;height:28px;border-radius:999px;background:#fff;font-size:13px;color:${c.sea};display:flex;align-items:center;padding:0 14px">nytimes.com/2026/10/12/travel/lagos…</div>
        <div style="width:28px;height:28px;border-radius:8px;background:${c.sea};display:flex;align-items:center;justify-content:center">${boat("#fff", 20)}</div></div>
      <div style="padding:24px 26px;color:${c.night}"><div style="font-family:Serif;font-size:34px;line-height:1.05;letter-spacing:-.02em">36 Hours in Lagos</div>
        <div style="height:10px;width:85%;background:${c.sunken};border-radius:6px;margin-top:20px"></div><div style="height:10px;width:70%;background:${c.sunken};border-radius:6px;margin-top:10px"></div><div style="height:10px;width:78%;background:${c.sunken};border-radius:6px;margin-top:10px"></div></div>
      <div style="position:absolute;right:20px;top:58px;width:230px;background:${c.paper};border:1.5px solid ${c.line};border-radius:18px;padding:16px;box-shadow:0 20px 40px -18px rgba(47,27,99,.45);display:flex;flex-direction:column;align-items:center;gap:8px">
        <div class="mono" style="font-size:10px;letter-spacing:.14em;color:${c.sea};font-weight:700;align-self:flex-start">SENDING THIS PAGE</div>${qr(150, c.night, 17)}<div style="font-size:26px;font-weight:600;color:${c.sea};letter-spacing:-.02em">620 447</div></div>
    </div>
    ${phone(420, 300, 112, 214, `<div class="mono" style="font-size:9px;letter-spacing:.12em;color:${c.sea};font-weight:700">FROM CHROME</div><div style="font-size:15px;font-weight:600;margin-top:6px;line-height:1.15">36 Hours in Lagos</div><div style="font-size:10px;color:${c.sea};margin-top:4px">nytimes.com/…</div><div style="margin-top:10px;font-size:11px;border:1.5px solid ${c.sea};border-radius:999px;padding:6px;text-align:center;color:${c.sea};font-weight:700">OPEN LINK</div>`, 6)}`,

  compare: () => {
    const names = ["WeTransfer", "AirDrop", "PairDrop", "Send Anywhere", "LocalSend"];
    const rows = [["Any device, in a browser", [0, 0, 1, 1, 0]], ["No size cap", [0, 1, 0, 0, 1]], ["Resumes after a drop", [0, 0, 0, 0, 0]], ["Works with no internet", [0, 1, 0, 1, 1]]];
    return `<div class="card" style="left:20px;top:110px;width:520px;padding:20px 22px">
      <div style="display:grid;grid-template-columns:1.7fr repeat(6,1fr);gap:0;font-size:12px;align-items:center">
        <div></div><div style="font-weight:700;color:${c.sea};text-align:center">Ferry</div>${names.map((n) => `<div style="text-align:center;color:${c.deep};opacity:.75;font-size:11px;line-height:1.1">${n}</div>`).join("")}
        ${rows.map(([label, v]) => `<div style="font-size:15px;font-weight:600;padding:16px 0;border-top:1.5px solid ${c.line}">${label}</div><div style="display:flex;justify-content:center;border-top:1.5px solid ${c.line};padding:16px 0;background:${c.sunken}">${tick(c.signal)}</div>${v.map((x) => `<div style="display:flex;justify-content:center;border-top:1.5px solid ${c.line};padding:16px 0;opacity:${x ? 1 : 0.45}">${x ? tick(c.signal) : cross("#b9a9e6")}</div>`).join("")}`).join("")}
      </div></div>`;
  },

  versus: (entry) => `
    <div class="card" style="left:20px;top:150px;width:520px;padding:10px 24px;transform:rotate(-1.5deg)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 18px;padding:12px 0 8px"><div class="mono" style="font-size:13px;letter-spacing:.14em;font-weight:700;color:${c.sea}">FERRY</div><div class="mono" style="font-size:13px;letter-spacing:.14em;font-weight:700;color:${c.deep};opacity:.6">${entry.name.toUpperCase()}</div></div>
      ${entry.facts.map(([label, ferry, them]) => `<div style="border-top:1.5px solid ${c.line};padding:14px 0"><div style="font-size:12px;color:${c.sea};font-family:Mono;letter-spacing:.1em;text-transform:uppercase">${label}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:6px;font-size:18px;line-height:1.25"><div style="font-weight:600;display:flex;gap:8px">${tick(c.signal)}<span>${ferry}</span></div><div style="opacity:.75">${them}</div></div></div>`).join("")}
    </div>`,

  privacy: () => `
    <div class="card" style="left:40px;top:110px;width:480px;padding:26px 28px;transform:rotate(-2deg)">
      <div class="mono" style="font-size:12px;letter-spacing:.14em;color:${c.signal};font-weight:700">WHAT THE SERVER EVER SEES</div>
      ${[["Your files", 0], ["File names", 0], ["Encryption keys", 0], ["A code to connect the two devices", 1]].map(([label, yes]) => `<div style="display:flex;align-items:center;gap:14px;padding:16px 0;border-top:1.5px solid ${c.line};margin-top:${label === "Your files" ? 14 : 0}px;font-size:21px;font-weight:600;${yes ? "" : "text-decoration:line-through;text-decoration-thickness:2px;opacity:.6"}">${yes ? tick(c.signal) : cross(c.magenta)}${label}</div>`).join("")}
    </div>
    <div style="position:absolute;left:380px;top:400px;width:110px;height:110px;border-radius:32px;background:${c.forest};display:flex;align-items:center;justify-content:center;transform:rotate(8deg)"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="${c.mint}" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>`,

  terms: () => `
    <div class="card" style="left:70px;top:110px;width:420px;height:440px;padding:30px;transform:rotate(-3deg)">
      <div style="font-family:Serif;font-size:36px;letter-spacing:-.02em;color:${c.night}">Terms of use</div>
      ${[90, 76, 84, 60, 88, 70, 80, 52].map((w, i) => `<div style="height:10px;width:${w}%;background:${i === 3 ? c.lilac : c.sunken};border-radius:6px;margin-top:${i === 4 ? 26 : 13}px"></div>`).join("")}
      <div style="margin-top:28px;display:inline-flex;align-items:center;gap:8px;font-size:16px;color:${c.sea};font-weight:600">${tick(c.signal)} Free. No account. No tracking.</div>
    </div>`,
};

const versus = {
  "ferry-vs-wetransfer": { tone: "purple", facts: [["Size limit", "No cap", "3 GB free"], ["Where files go", "Device to device", "Stored on its servers"], ["Price", "Free, no paid plan", "Paid plans for more"]] },
  "ferry-vs-airdrop": { tone: "mint", facts: [["Works on", "Any device with a browser", "Mostly Apple devices"], ["Distance", "Anywhere online", "About 10 metres"], ["Several receivers", "Up to 16 at once", "One at a time"]] },
  "ferry-vs-pairdrop": { tone: "peach", facts: [["Large files", "Written to storage", "Held in memory"], ["Resume", "Picks up where it stopped", "Start again"], ["Security code", "Both screens show one", "None to compare"]] },
  "ferry-vs-send-anywhere": { tone: "night", facts: [["Install", "Nothing, in the browser", "Apps for each device"], ["Ads", "None", "In the free apps"], ["Code lifetime", "Open for 24 hours", "10 minutes"]] },
  "ferry-vs-localsend": { tone: "cream", facts: [["Install", "Nothing, in the browser", "App on both devices"], ["Other networks", "Yes, over the internet", "No"], ["Resume", "Picks up where it stopped", "Start again"]] },
};
const names = { "ferry-vs-wetransfer": "WeTransfer", "ferry-vs-airdrop": "AirDrop", "ferry-vs-pairdrop": "PairDrop", "ferry-vs-send-anywhere": "Send Anywhere", "ferry-vs-localsend": "LocalSend" };

const cards = [
  { file: "home", tone: "purple", eyebrow: "Free file transfer", title: "Your files.<br>Your devices.<br><em>One scan.</em>", sub: "Straight from one device to the other. No upload, no size cap.", chips: ["No account", "Encrypted"], art: art.home },
  { file: "room", tone: "lilac", eyebrow: "Incoming transfer", title: "Someone is sending you <em>files.</em>", sub: "Open the link to receive them, straight from their device.", chips: ["Nothing to install", "Encrypted"], art: art.room },
  { file: "offline", tone: "night", eyebrow: "Offline mode", title: "Send files with <em>no internet</em> at all.", sub: "Two devices on the same Wi-Fi, connected by two QR codes.", chips: ["No server", "Encrypted"], art: art.offline },
  { file: "developers", tone: "mint", eyebrow: "Developers", title: "Send files from the <em>terminal.</em>", sub: "The same encrypted protocol as the browser, in one command.", chips: ["CLI", "HTTP API"], art: art.developers },
  { file: "agents", tone: "peach", eyebrow: "For AI agents", title: "Your agent can hand you <em>a file.</em>", sub: "An MCP server and a JSON command line, straight to your phone.", chips: ["MCP", "JSON CLI"], art: art.agents },
  { file: "extension", tone: "purple", eyebrow: "Chrome extension", title: "Send this page to your <em>phone.</em>", sub: "One click in Chrome. Scan the code, and it is there.", chips: ["Free", "Encrypted"], art: art.extension },
  { file: "compare", tone: "cream", eyebrow: "Compare", title: "Which file transfer tool <em>fits?</em>", sub: "Ferry next to WeTransfer, AirDrop, PairDrop, Send Anywhere and LocalSend.", chips: ["5 comparisons"], art: art.compare },
  { file: "privacy", tone: "mint", eyebrow: "Privacy", title: "Your files never touch <em>our server.</em>", sub: "What Ferry stores, what it never receives, and for how long.", chips: ["No tracking"], art: art.privacy },
  { file: "terms", tone: "lilac", eyebrow: "Terms", title: "The rules, in <em>plain words.</em>", sub: "The terms for using Ferry, short enough to read.", chips: ["Free", "Open source"], art: art.terms },
  ...Object.entries(versus).map(([slug, v]) => ({
    file: slug, tone: v.tone, eyebrow: "Compare", title: `Ferry vs <em>${names[slug]}</em>`, sub: "Side by side, and which one to use when.", chips: ["Checked October 2026"],
    art: () => art.versus({ name: names[slug], facts: v.facts }),
  })),
];

const only = process.argv.slice(2);
await mkdir("public/og", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined });
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const card of cards) {
  if (only.length && !only.includes(card.file)) continue;
  const t = tones[card.tone];
  // A file page, because a blank page is not allowed to load the local font files.
  const html = path.join(tmpdir(), `ferry-og-${card.file}.html`);
  await writeFile(html, frame(t, { ...card, art: card.art(t) }));
  await tab.goto(pathToFileURL(html).href, { waitUntil: "load" });
  await rm(html, { force: true });
  const failed = await tab.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status !== "loaded").map((f) => f.family); });
  if (failed.length) throw new Error(`Fonts did not load: ${failed.join(", ")}`);
  await tab.screenshot({ path: `public/og/${card.file}.png`, type: "png" });
  console.log(`public/og/${card.file}.png`);
}
await browser.close();
