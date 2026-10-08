import { mkdir, writeFile } from "node:fs/promises";
import { comparisons } from "../src/lib/compare";
import { ogImage, type OgTone } from "../src/lib/og";
import { site } from "../src/lib/site";

type Card = { file: string; eyebrow: string; title: string; subtitle?: string; tone?: OgTone; chips?: string[] };

const cards: Card[] = [
  {
    file: "home",
    eyebrow: "Free file transfer",
    title: "Your files. Your devices. One scan to connect them.",
    subtitle: "Sent directly to your other device. No upload, no size cap.",
  },
  {
    file: "offline",
    eyebrow: "Offline mode",
    title: "Send files with no internet at all.",
    subtitle: "Two devices on the same Wi-Fi or hotspot, connected by QR code.",
    tone: "night",
    chips: ["Same Wi-Fi", "No server", "Encrypted"],
  },
  {
    file: "developers",
    eyebrow: "Developers",
    title: `npx ${site.cliPackage} send report.pdf`,
    subtitle: "Send from a terminal to any browser, with the same encryption.",
    tone: "green",
    chips: ["Command line", "HTTP API", "Same encryption"],
  },
  {
    file: "compare",
    eyebrow: "Compare",
    title: "Which file transfer tool should you use?",
    subtitle: "Ferry next to WeTransfer, AirDrop, PairDrop, Send Anywhere and LocalSend.",
    tone: "cream",
    chips: ["5 comparisons", "Checked October 2026"],
  },
  ...comparisons.map((entry) => ({
    file: entry.slug,
    eyebrow: "Compare",
    title: `${site.name} vs ${entry.name}`,
    subtitle: entry.title.split(": ")[1].replace(/^./, (c) => c.toUpperCase()),
    tone: entry.tone,
    chips: ["Side by side", "Which to use when"],
  })),
];

async function main() {
  await mkdir("public/og", { recursive: true });
  for (const card of cards) {
    const image = await ogImage(card);
    await writeFile(`public/og/${card.file}.png`, Buffer.from(await image.arrayBuffer()));
    console.log(`public/og/${card.file}.png`);
  }
}

void main();
