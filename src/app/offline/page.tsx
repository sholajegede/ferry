import { OfflineClient } from "@/components/offline-client";
import { breadcrumbs, JsonLd, pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata = pageMeta({
  image: "offline",
  title: "Offline mode: send files with no internet",
  description:
    "Send files between two devices on the same Wi-Fi or hotspot with no internet connection. The devices connect by scanning each other's QR codes.",
  path: "/offline",
});

const steps = [
  "Put both devices on the same Wi-Fi network or phone hotspot.",
  "Open offline mode on both devices. Choose Send on one and Receive on the other.",
  "Scan the sender's QR code with the receiver, then scan the receiver's code with the sender.",
  "Pick the files. They go straight across the local network.",
];

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-[1304px] px-4 py-10 sm:px-6">
      <JsonLd
        graph={[
          breadcrumbs([{ name: "Offline mode", path: "/offline" }]),
          {
            "@type": "HowTo",
            name: `How to send files without internet using ${site.name}`,
            step: steps.map((text, index) => ({
              "@type": "HowToStep",
              position: index + 1,
              text,
            })),
          },
        ]}
      />
      <p className="eyebrow">Offline mode</p>
      <h1 className="mt-6 max-w-3xl text-[2.6rem] sm:text-[3.4rem] lg:text-[4rem]">
        Send with no internet at all
      </h1>
      <p className="serif mt-5 max-w-2xl text-xl leading-snug sm:text-2xl">
        Put both devices on the same Wi-Fi or phone hotspot. They connect by
        scanning each other&rsquo;s QR code, and the files stay on your local
        network. Open this page once while you are online so it is saved for
        later.
      </p>
      <div className="mt-12">
        <OfflineClient />
      </div>
    </div>
  );
}
