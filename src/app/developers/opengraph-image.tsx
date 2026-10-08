import { ogImage, ogSize, ogType } from "@/lib/og";
import { site } from "@/lib/site";

export const alt = `${site.name} for developers: command line and API`;
export const size = ogSize;
export const contentType = ogType;

export default function Image() {
  return ogImage({
    eyebrow: "Developers",
    title: `npx ${site.cliPackage} send report.pdf`,
    subtitle: "Send from a terminal to any browser, with the same encryption.",
    tone: "green",
    chips: ["Command line", "HTTP API", "Same encryption"],
  });
}
