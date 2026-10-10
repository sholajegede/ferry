"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { label: "Receive files", href: "/#receive" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Why Ferry", href: "/#why-ferry" },
  { label: "Privacy", href: "/#privacy" },
  { label: "Questions", href: "/#faq" },
  { label: "Compare", href: "/compare" },
  { label: "Developers", href: "/developers" },
  { label: "For AI agents", href: "/agents" },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((value) => !value)}
        className="ml-1 flex h-9 w-9 items-center justify-center rounded-full border border-sea text-sea-deep"
      >
        {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[-1] cursor-default bg-night/20"
          />
          <nav
            id="mobile-menu"
            aria-label="Quick links"
            className="absolute inset-x-3 top-[4.5rem] rounded-[24px] border border-line bg-paper p-2 shadow-[0_24px_60px_-30px_rgba(47,27,99,0.5)] sm:inset-x-6"
          >
            <ul>
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex h-12 items-center rounded-2xl px-4 text-lg font-medium hover:bg-sunken"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li className="mt-1 border-t border-line pt-1">
                <a
                  href="/offline"
                  className="flex h-12 items-center justify-between rounded-2xl px-4 text-lg font-medium hover:bg-sunken"
                >
                  Offline mode
                  <span className="eyebrow">No internet</span>
                </a>
              </li>
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}
