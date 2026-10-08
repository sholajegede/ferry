import Link from "next/link";
import { HeroExtras, SendButton } from "@/components/home-actions";
import { HeroMock } from "@/components/mocks";
import { ReceivePanel } from "@/components/receive-panel";
import { StepsTabs } from "@/components/steps-tabs";
import { faqs, featureList, howTo } from "@/lib/content";
import { appId, faqPage, JsonLd, organization, website } from "@/lib/seo";
import { site } from "@/lib/site";

const works = ["Chrome", "Safari", "Firefox", "Edge", "iPhone", "Android", "Mac", "Windows", "Linux", "Terminal"];

const features = [
  {
    label: "# Many files",
    body: "Pick several files or drop a whole folder. They go in one transfer and the folder keeps its structure.",
    tone: "bg-peach",
  },
  {
    label: "# Live progress",
    body: "See the speed, the time left, and whether the route is direct or relayed.",
    tone: "bg-mint",
  },
  {
    label: "# Any device",
    body: "Laptop, phone or tablet, in any current browser. There is nothing to install.",
    tone: "bg-lilac",
  },
  {
    label: "# QR or code",
    body: "Scan the QR code with a phone, or type six digits on a laptop.",
    tone: "bg-pink",
  },
  {
    label: "# Picks up again",
    body: "If the connection drops, the transfer continues from the last saved piece.",
    tone: "bg-mint",
  },
  {
    label: "# No account",
    body: "Start a transfer without signing up. A transfer stays open for 24 hours.",
    tone: "bg-peach",
  },
];

const pillars = [
  {
    title: "Only your two devices can read it",
    body: "Files and text are encrypted before they leave this device, with keys the two devices agree on between themselves.",
  },
  {
    title: "A code you can check",
    body: "Both screens show the same 6-digit security code when the connection is private.",
  },
  {
    title: "Nothing is stored on the way",
    body: "Ferry helps your devices find each other. The files then travel between them and are not uploaded to file storage.",
  },
  {
    title: "Works without internet",
    body: "On the same Wi-Fi or hotspot, offline mode connects two devices with QR codes alone.",
  },
];

const uses = [
  {
    title: "Photos from your phone",
    body: "Get pictures onto your laptop without emailing them to yourself.",
    soft: "bg-lilac",
    tone: "bg-sea",
  },
  {
    title: "Documents for work or school",
    body: "Move PDFs and presentations between devices in a few steps.",
    soft: "bg-pink",
    tone: "bg-magenta",
  },
  {
    title: "Videos and large files",
    body: "Send a multi-gigabyte file. It is saved to storage as it arrives.",
    soft: "bg-mint",
    tone: "bg-signal",
  },
  {
    title: "That file on another screen",
    body: "Phone to laptop, laptop to tablet, or a terminal to a phone.",
    soft: "bg-peach",
    tone: "bg-orange",
  },
];

const wrap = "mx-auto max-w-[1304px] px-4 sm:px-6";

export default function HomePage() {
  return (
    <>
      <JsonLd
        graph={[
          organization,
          website,
          {
            "@type": ["SoftwareApplication", "WebApplication"],
            "@id": appId,
            name: site.name,
            url: site.url,
            description: site.description,
            applicationCategory: "UtilitiesApplication",
            applicationSubCategory: "File transfer",
            operatingSystem: "iOS, Android, macOS, Windows, Linux, ChromeOS",
            browserRequirements: "A current version of Chrome, Safari, Firefox or Edge",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            featureList,
            image: `${site.url}/og/home.png`,
            publisher: { "@id": organization["@id"] },
          },
          {
            "@type": "HowTo",
            name: `How to send files between devices with ${site.name}`,
            totalTime: "PT1M",
            step: howTo.map((step, index) => ({
              "@type": "HowToStep",
              position: index + 1,
              name: step.name,
              text: step.text,
              url: `${site.url}/#how-it-works`,
            })),
          },
          faqPage(faqs),
        ]}
      />

      <section id="send" className={`${wrap} pt-8 sm:pt-10`}>
        <p className="inline-flex h-[30px] items-center overflow-hidden rounded-full border border-sea text-sm font-semibold">
          <span className="eyebrow flex h-full items-center border-r border-sea px-3">Free</span>
          <span className="px-3">No account needed</span>
        </p>
        {site.productHunt && (
          <a
            href={site.productHunt}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 inline-flex h-[30px] -rotate-2 items-center gap-2 rounded-full bg-orange px-3 align-top text-sm font-semibold text-white hover:rotate-0"
          >
            <span aria-hidden>&#9650;</span> Live on Product Hunt
          </a>
        )}
        <h1 className="mt-5 max-w-5xl text-[2.6rem] sm:text-[3.4rem] lg:text-[4rem]">
          Your files. Your devices.
          <br className="hidden sm:block" /> One scan to connect them.
        </h1>
        <p className="serif mt-5 max-w-3xl text-xl sm:text-2xl">
          Move photos, videos and documents between your devices with no cable, no setup and no
          account.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          <SendButton />
          <Link href="#receive" className="pill h-10 border border-sea px-6 text-[0.8125rem] hover:bg-sunken">
            Receive files
          </Link>
        </div>
        <HeroExtras />
      </section>

      <div
        className="mt-12 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
        aria-label={`Works in ${works.join(", ")}`}
        role="img"
      >
        <div className="marquee flex w-max gap-14 pr-14 text-2xl font-semibold tracking-[-0.04em]" aria-hidden>
          {[...works, ...works].map((name, index) => (
            <span key={index}>{name}</span>
          ))}
        </div>
      </div>

      <div className={`${wrap} mt-16`}>
        <HeroMock />
      </div>

      <section className={`${wrap} pt-36 text-center`}>
        <p className="eyebrow">No cables, no hassle</p>
        <h2 className="serif mx-auto mt-8 max-w-xl text-4xl !tracking-[-0.03em] sm:text-[3.25rem] sm:leading-[1.1]">
          Open Ferry and start.{" "}
          <strong className="font-bold">Your files stay between your devices.</strong>
        </h2>
        <p className="serif mx-auto mt-10 max-w-md text-xl leading-snug">
          There is no sign-up form between you and your files, and nothing to plug in.
        </p>
        <p className="serif mx-auto mt-5 max-w-md text-xl leading-snug">
          Ferry helps your devices find each other. The files then go from one to the other, and
          are not uploaded to a file store on the way.
        </p>
      </section>

      <section id="how-it-works" className={`${wrap} pt-32`}>
        <p className="eyebrow">How it works</p>
        <h2 className="mt-6 max-w-3xl text-4xl sm:text-5xl">
          From one screen to another
          <br className="hidden sm:block" /> in three steps.
        </h2>
        <p className="serif mb-12 mt-5 max-w-xl text-xl leading-snug sm:text-2xl">
          No app to install, no account to create and no settings to figure out.
        </p>
        <StepsTabs />
        <div className="mt-8">
          <SendButton label="Try Ferry" />
        </div>
      </section>

      <section id="why-ferry" className="mt-32 bg-sunken py-24">
        <div className={wrap}>
          <div className="rounded-[40px] bg-white p-6 sm:p-10">
            <h2 className="text-4xl text-orange sm:text-5xl">
              <strong className="font-bold">Everything</strong> you need,
              <br />
              nothing you don’t.
            </h2>
            <p className="serif mt-4 max-w-md text-xl leading-snug text-orange">
              The parts of a file transfer that matter, and none of the setup.
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <li key={feature.label} className="overflow-hidden rounded-[14px] border border-line bg-paper">
                  <div className={`h-24 ${feature.tone}`} aria-hidden>
                    <div className="flex h-full items-end gap-2 px-6">
                      <span className="h-10 w-10 rounded-t-full bg-white/70" />
                      <span className="h-16 w-10 rounded-t-full bg-white/50" />
                      <span className="h-7 w-10 rounded-t-full bg-white/80" />
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="!font-mono text-[0.9375rem] !font-bold !tracking-normal">
                      {feature.label}
                    </h3>
                    <p className="mt-2 leading-snug">{feature.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="privacy" className={`${wrap} pt-32`}>
        <div className="grid gap-12 rounded-[40px] bg-sea p-8 text-on-sea sm:p-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Privacy</p>
            <h2 className="mt-8 text-4xl sm:text-5xl">
              Your files take
              <br />
              the direct route.
            </h2>
            <p className="serif mt-6 max-w-sm text-xl leading-snug">
              Speed depends on your devices and your network. Some networks block direct
              connections.
            </p>
          </div>
          <div>
            <dl className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
              {pillars.map((pillar) => (
                <div key={pillar.title}>
                  <dt className="serif text-[1.375rem] !font-bold leading-[1.1]">{pillar.title}</dt>
                  <dd className="mt-3 text-[0.9375rem] leading-normal">{pillar.body}</dd>
                </div>
              ))}
            </dl>
            <Link
              href="/privacy"
              className="pill mt-10 h-9 bg-paper px-5 text-xs text-sea-deep hover:bg-lilac"
            >
              Read the privacy policy
            </Link>
          </div>
        </div>
      </section>

      <section className={`${wrap} pt-32`}>
        <p className="eyebrow">What people send</p>
        <h2 className="mt-6 max-w-2xl text-4xl sm:text-5xl">
          For the files
          <br className="hidden sm:block" /> you need right now.
        </h2>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {uses.map((use) => (
            <li key={use.title} className={`flex min-h-72 flex-col rounded-[24px] p-3 ${use.soft}`}>
              <p className="px-3 pb-4 pt-3 text-xl font-semibold leading-tight tracking-[-0.02em] text-sea-deep">
                {use.title}
              </p>
              <p
                className={`serif mt-auto ml-auto flex min-h-40 w-4/5 items-end rounded-[10px] p-4 text-right text-lg leading-tight text-on-sea ${use.tone}`}
              >
                {use.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section id="faq" className={`${wrap} pt-32`}>
        <h2 className="serif text-center text-4xl sm:text-5xl">FAQs</h2>
        <div className="mt-12 border-t border-line">
          {faqs.map((faq) => (
            <details key={faq.q} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-7 text-xl font-medium [&::-webkit-details-marker]:hidden">
                {faq.q}
                <span
                  className="flex-none text-2xl font-light leading-none transition-transform group-open:rotate-45"
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p className="max-w-3xl pb-8 text-lg leading-normal">{faq.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-lg">
          Wondering how {site.name} differs from WeTransfer, AirDrop or LocalSend?{" "}
          <Link href="/compare" className="font-semibold text-sea-deep underline underline-offset-4">
            See the comparisons
          </Link>
          .
        </p>
      </section>

      <section id="receive" className={`${wrap} pt-32`}>
        <div className="rounded-[40px] bg-sea p-6 text-center text-on-sea sm:p-12">
          <h2 className="mx-auto max-w-3xl text-5xl sm:text-7xl">Your files are ready to move.</h2>
          <p className="mx-auto mt-5 max-w-md text-2xl font-medium leading-tight tracking-[-0.02em]">
            Open Ferry on both devices, scan to connect, and send what you need.
          </p>
          <div className="mb-10 mt-8 flex flex-wrap justify-center gap-2">
            <SendButton label="Start a transfer" tone="light" />
            <a href="/offline" className="pill h-10 border border-paper px-6 text-[0.8125rem] hover:bg-white/10">
              No internet? Offline mode
            </a>
          </div>
          <ReceivePanel />
        </div>
      </section>
    </>
  );
}
