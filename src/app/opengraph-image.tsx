import { ogImage, ogSize, ogType } from "@/lib/og";
import { site } from "@/lib/site";

export const alt = `${site.name}: ${site.tagline.toLowerCase()}`;
export const size = ogSize;
export const contentType = ogType;

export default function Image() {
  return ogImage({
    eyebrow: "Free file transfer",
    title: "Your files. Your devices. One scan to connect them.",
    subtitle: "Sent directly to your other device. No upload, no size cap.",
  });
}
