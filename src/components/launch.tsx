"use client";

import { useClientValue } from "@/lib/web/hooks";
import { site } from "@/lib/site";

const startsAt = site.productHuntAt ? Date.parse(site.productHuntAt) : 0;

function useLive() {
  return useClientValue(() => !startsAt || Date.now() >= startsAt, !startsAt);
}

const day = startsAt
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "America/Los_Angeles" }).format(startsAt)
  : "";

export function LaunchBar() {
  const live = useLive();
  return (
    <div className="bg-night px-4 py-2.5 text-center text-sm text-paper">
      <span aria-hidden>&#9650;</span>{" "}
      {live ? "Ferry is live on Product Hunt today." : `Ferry launches on Product Hunt on ${day}.`}{" "}
      <a
        href={site.productHunt}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-2 inline-flex h-6 items-center rounded-md bg-peach px-2.5 text-[0.8125rem] font-semibold text-night hover:bg-paper"
      >
        {live ? "Come say hello" : "Get notified"}
      </a>
    </div>
  );
}

export function LaunchPill() {
  const live = useLive();
  return (
    <a
      href={site.productHunt}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-2 inline-flex h-[30px] -rotate-2 items-center gap-2 rounded-full bg-orange px-3 align-top text-sm font-semibold text-white hover:rotate-0"
    >
      <span aria-hidden>&#9650;</span> {live ? "Live on Product Hunt" : "Coming to Product Hunt"}
    </a>
  );
}
