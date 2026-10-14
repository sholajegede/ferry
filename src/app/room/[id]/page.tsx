import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomClient } from "@/components/room-client";

const share = { url: "/og/room.png", type: "image/png", width: 1200, height: 630, alt: "Someone is sending you files with Ferry" };

export const metadata: Metadata = {
  title: "Someone is sending you files",
  description: "Open this link to receive the files, straight from their device. End-to-end encrypted, with nothing to install.",
  openGraph: {
    title: "Someone is sending you files with Ferry",
    description: "Open this link to receive the files, straight from their device. End-to-end encrypted, with nothing to install.",
    images: [share],
  },
  twitter: { card: "summary_large_image", title: "Someone is sending you files with Ferry", images: [share] },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RoomPage() {
  return (
    <div className="mx-auto max-w-[1304px] px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-ink/80">Opening the transfer</p>}>
        <RoomClient />
      </Suspense>
    </div>
  );
}
