import { ogImage, ogSize, ogType } from "@/lib/og";

export const alt = "Offline mode: send files with no internet";
export const size = ogSize;
export const contentType = ogType;

export default function Image() {
  return ogImage({
    eyebrow: "Offline mode",
    title: "Send files with no internet at all.",
    subtitle: "Two devices on the same Wi-Fi or hotspot, connected by QR code.",
    tone: "night",
    chips: ["Same Wi-Fi", "No server", "Encrypted"],
  });
}
