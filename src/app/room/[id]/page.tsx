import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomClient } from "@/components/room-client";

export const metadata: Metadata = {
  title: "Transfer",
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
