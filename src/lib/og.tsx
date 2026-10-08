import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { site } from "./site";

export const ogSize = { width: 1200, height: 630 };
export const ogType = "image/png";

const tones = {
  purple: { bg: "#714bd0", ink: "#fcf9f5", soft: "#dfd8ff", chip: "#4f2f9b", chipInk: "#fcf9f5" },
  cream: { bg: "#fcf9f5", ink: "#4f2f9b", soft: "#714bd0", chip: "#dfd8ff", chipInk: "#4f2f9b" },
  night: { bg: "#2f1b63", ink: "#fcf9f5", soft: "#dfd8ff", chip: "#714bd0", chipInk: "#fcf9f5" },
  green: { bg: "#cae4d4", ink: "#00512f", soft: "#007f4a", chip: "#00512f", chipInk: "#fcf9f5" },
  peach: { bg: "#ffd9bf", ink: "#7a3400", soft: "#c05100", chip: "#c05100", chipInk: "#fcf9f5" },
};

export type OgTone = keyof typeof tones;

async function fonts() {
  try {
    const [sans, serif] = await Promise.all([
      readFile(join(process.cwd(), "assets/fonts/hanken-grotesk-latin-600-normal.woff")),
      readFile(join(process.cwd(), "assets/fonts/newsreader-latin-400-normal.woff")),
    ]);
    return [
      { name: "Sans", data: sans, weight: 600 as const, style: "normal" as const },
      { name: "Serif", data: serif, weight: 400 as const, style: "normal" as const },
    ];
  } catch {
    return undefined;
  }
}

export async function ogImage(options: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  tone?: OgTone;
  chips?: string[];
}) {
  const tone = tones[options.tone ?? "purple"];
  const host = site.url.replace(/^https?:\/\//, "");
  const long = options.title.length > 44;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: tone.bg,
          color: tone.ink,
          padding: 64,
          fontFamily: "Sans",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 46, letterSpacing: -2 }}>
            <svg width="56" height="56" viewBox="0 0 32 32" fill="none" style={{ marginRight: 14 }}>
              <circle cx="16" cy="16" r="14.5" stroke={tone.ink} strokeWidth="2" />
              <path
                d="M8 14h16l-2.2 5.2a2.6 2.6 0 0 1-2.4 1.6h-6.8a2.6 2.6 0 0 1-2.4-1.6z"
                fill={tone.ink}
              />
              <path d="M12.5 14v-3a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3" stroke={tone.ink} strokeWidth="2" />
            </svg>
            {site.name.toLowerCase()}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: 44,
              padding: "0 22px",
              borderRadius: 999,
              border: `2px solid ${tone.ink}`,
              fontSize: 20,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {options.eyebrow}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: long ? 68 : 84,
              lineHeight: 1.04,
              letterSpacing: long ? -2.5 : -3.5,
              maxWidth: 1040,
            }}
          >
            {options.title}
          </div>
          {options.subtitle && (
            <div
              style={{
                fontFamily: "Serif",
                fontSize: 34,
                lineHeight: 1.25,
                marginTop: 24,
                maxWidth: 940,
                color: tone.soft,
              }}
            >
              {options.subtitle}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex" }}>
            {(options.chips ?? ["Free", "No account", "End-to-end encrypted"]).map((chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 46,
                  padding: "0 22px",
                  marginRight: 10,
                  borderRadius: 999,
                  background: tone.chip,
                  color: tone.chipInk,
                  fontSize: 22,
                }}
              >
                {chip}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 24 }}>{host}</div>
        </div>
      </div>
    ),
    { ...ogSize, fonts: await fonts() },
  );
}
