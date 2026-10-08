import Link from "next/link";
import { site } from "@/lib/site";
import { Suspense } from "react";
import { SendButton } from "./home-actions";
import { LaunchBar } from "./launch";
import { MobileMenu } from "./mobile-menu";

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden fill="none">
      <circle cx="16" cy="16" r="14.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 14h16l-2.2 5.2a2.6 2.6 0 0 1-2.4 1.6h-6.8a2.6 2.6 0 0 1-2.4-1.6z" fill="currentColor" />
      <path d="M12.5 14v-3a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3" stroke="currentColor" strokeWidth="2" />
      <path d="M7 24.2c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const linkClass = "rounded-full px-3 py-2 font-medium hover:bg-sunken";

export function SiteHeader() {
  return (
    <>
      {site.productHunt ? (
        <LaunchBar />
      ) : (
        <div className="bg-night px-4 py-2.5 text-center text-sm text-paper">
          New: send files with no internet at all.{" "}
          <a
            href="/offline"
            className="ml-2 inline-flex h-6 items-center rounded-md bg-paper px-2.5 text-[0.8125rem] font-semibold text-night hover:bg-lilac"
          >
            Try offline mode
          </a>
        </div>
      )}
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
        <div className="mx-auto flex h-14 max-w-[1304px] items-center justify-between gap-4 rounded-full bg-paper/85 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-5">
            <Link href="/" className="flex items-center gap-2 text-[1.65rem] font-semibold tracking-[-0.04em]">
              <Mark />
              <span className="lowercase">{site.name}</span>
            </Link>
            <nav aria-label="Main" className="hidden items-center md:flex">
              <Link href="/#how-it-works" className={linkClass}>
                How it works
              </Link>
              <Link href="/#why-ferry" className={linkClass}>
                Why Ferry
              </Link>
              <Link href="/#privacy" className={linkClass}>
                Privacy
              </Link>
              <Link href="/compare" className={linkClass}>
                Compare
              </Link>
              <Link href="/developers" className={linkClass}>
                Developers
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/#receive" className={`${linkClass} hidden sm:block`}>
              Receive files
            </Link>
            <SendButton tone="nav" />
            <Suspense fallback={null}>
              <MobileMenu />
            </Suspense>
          </div>
        </div>
      </header>
    </>
  );
}

const columns: { title: string; links: { label: string; href: string; plain?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Send files", href: "/#send" },
      { label: "Receive files", href: "/#receive" },
      { label: "Offline mode", href: "/offline", plain: true },
      { label: "How it works", href: "/#how-it-works" },
    ],
  },
  {
    title: "Discover",
    links: [
      { label: "Why Ferry", href: "/#why-ferry" },
      { label: "Privacy at a glance", href: "/#privacy" },
      { label: "Questions", href: "/#faq" },
      { label: "Compare", href: "/compare" },
    ],
  },
  {
    title: "Compare",
    links: [
      { label: "vs WeTransfer", href: "/compare/ferry-vs-wetransfer" },
      { label: "vs AirDrop", href: "/compare/ferry-vs-airdrop" },
      { label: "vs PairDrop", href: "/compare/ferry-vs-pairdrop" },
      { label: "vs Send Anywhere", href: "/compare/ferry-vs-send-anywhere" },
      { label: "vs LocalSend", href: "/compare/ferry-vs-localsend" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Command line", href: "/developers" },
      { label: "HTTP API", href: "/developers#http-api" },
      { label: "Encryption", href: "/developers#encryption" },
      { label: "Source code", href: site.repo, plain: true },
    ],
  },
  {
    title: "Trust and legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-32 pb-10">
      <div className="mx-auto max-w-[1304px] px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-5">
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="eyebrow mb-6">{column.title}</p>
              <ul className="space-y-2.5 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.plain ? (
                      <a href={link.href} className="hover:underline">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="hover:underline">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 text-sm">
          <p className="font-semibold">© {site.name}</p>
          <p className="pill h-8 bg-sunken px-4 text-[0.6875rem]">Nothing you send is stored on a server</p>
        </div>
      </div>
    </footer>
  );
}
