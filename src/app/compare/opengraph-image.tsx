import { ogImage, ogSize, ogType } from "@/lib/og";

export const alt = "Which file transfer tool should you use?";
export const size = ogSize;
export const contentType = ogType;

export default function Image() {
  return ogImage({
    eyebrow: "Compare",
    title: "Which file transfer tool should you use?",
    subtitle: "Ferry next to WeTransfer, AirDrop, PairDrop, Send Anywhere and LocalSend.",
    tone: "cream",
    chips: ["5 comparisons", "Checked October 2026"],
  });
}
