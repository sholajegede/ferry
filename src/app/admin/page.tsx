import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { api } from "../../../convex/_generated/api";
import { AdminLogin, AdminSignOut } from "@/components/admin-login";
import { ADMIN_COOKIE, adminConfigured, sessionValid } from "@/lib/server/admin";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

type Entry = { name: string; value: number };

function bytes(value: number) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1000 && unit < units.length - 1) {
    amount /= 1000;
    unit++;
  }
  return `${amount >= 100 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`;
}

const number = (value: number) => value.toLocaleString("en");

function flag(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const routeNames: Record<string, string> = {
  lan: "Same network",
  direct: "Direct over the internet",
  relay: "Relayed",
};
const joinNames: Record<string, string> = {
  link: "QR code or link",
  code: "6-digit code",
  nearby: "Network list",
};
const eventNames: Record<string, string> = {
  visit: "Page view",
  room: "Transfer started",
  join: "Device joined",
  file: "File sent",
  note: "Text sent",
  pair: "Devices remembered",
  offline: "Offline transfer",
};

function Breakdown({
  title,
  rows,
  tone,
  rename,
  detail,
  empty = "No data yet.",
}: {
  title: string;
  rows: Entry[];
  tone: string;
  rename?: (name: string) => string;
  detail?: (entry: Entry) => string;
  empty?: string;
}) {
  const peak = Math.max(1, ...rows.map((row) => row.value));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <section className="rounded-[14px] border border-line bg-paper p-6">
      <h2 className="eyebrow">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {rows.map((row) => (
            <li key={row.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-semibold text-sea-deep">
                  {rename ? rename(row.name) : row.name}
                </span>
                <span className="flex-none tabular-nums">
                  {detail ? detail(row) : number(row.value)}{" "}
                  <span className="opacity-70">{Math.round((row.value / total) * 100)}%</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${(row.value / peak) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function Dashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const store = await cookies();
  const params = await searchParams;
  if (!adminConfigured())
    return (
      <p className="serif max-w-xl text-xl">
        The admin page is not set up. Set ADMIN_PASSWORD (12 characters or more) and ANALYTICS_KEY
        in the web app, and the same ANALYTICS_KEY in Convex.
      </p>
    );
  if (!sessionValid(store.get(ADMIN_COOKIE)?.value)) return <AdminLogin />;

  const days = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const data = await fetchQuery(api.stats.summary, { key: process.env.ANALYTICS_KEY!, days });
  if (!data)
    return (
      <p className="serif max-w-xl text-xl">
        Convex rejected the analytics key. Set the same ANALYTICS_KEY in Convex and in the web app.
      </p>
    );

  const { range, totals } = data;
  const peak = Math.max(1, ...data.series.map((day) => Math.max(day.visits, day.files, day.rooms)));
  const cards: [string, string, string, string][] = [
    ["Visitors", number(range.visitors), `${number(range.visits)} page views`, "bg-lilac"],
    ["People who sent", number(range.senders), `${number(range.rooms)} transfers started`, "bg-mint"],
    ["Devices joined", number(range.joins), range.rooms ? `${(range.joins / range.rooms).toFixed(1)} per transfer` : "none yet", "bg-peach"],
    ["Files sent", number(range.files), range.files ? `${bytes(range.bytes / range.files)} on average` : "none yet", "bg-pink"],
    ["Data sent", bytes(range.bytes), `${bytes(totals.bytes)} all time`, "bg-mint"],
    ["Text sent", number(range.notes), `${number(range.pairs)} devices remembered, ${number(range.offline)} offline`, "bg-lilac"],
  ];
  const funnel: [string, number][] = [
    ["Visitors", range.visitors],
    ["Started a transfer", range.senders],
    ["A device joined", range.joins],
    ["Files delivered", range.files],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full bg-sunken p-1">
          {[7, 30, 90].map((option) => (
            <Link
              key={option}
              href={`/admin?days=${option}`}
              className={`pill h-8 px-4 text-[0.6875rem] ${option === days ? "bg-sea text-on-sea" : "hover:bg-lilac"}`}
            >
              {option} days
            </Link>
          ))}
        </div>
        <AdminSignOut />
      </div>

      {data.truncated && (
        <p className="rounded-[14px] bg-peach px-4 py-3 text-sm text-orange">
          This range has more events than one report reads. The breakdowns cover the most recent
          12,000 events. Totals are complete.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map(([title, value, note, tone]) => (
          <div key={title} className={`rounded-[20px] p-5 text-sea-deep ${tone}`}>
            <dt className="eyebrow">{title}</dt>
            <dd className="digits mt-3 text-5xl">{value}</dd>
            <dd className="mt-2 text-sm">{note}</dd>
          </div>
        ))}
      </dl>

      <section className="rounded-[14px] border border-line bg-paper p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="eyebrow">Each day</h2>
          <p className="flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-sea" />Page views</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-signal" />Transfers</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-orange" />Files</span>
          </p>
        </div>
        <div className="mt-6 overflow-x-auto">
          <div className="flex h-44 min-w-[36rem] items-end gap-[3px]" role="img" aria-label="Daily page views, transfers and files">
            {data.series.map((day) => (
              <div
                key={day.day}
                className="flex h-full flex-1 items-end justify-center gap-px"
                title={`${day.day}: ${day.visits} page views, ${day.visitors} visitors, ${day.rooms} transfers, ${day.files} files, ${bytes(day.bytes)}`}
              >
                <span className="w-full max-w-2 rounded-t-sm bg-sea" style={{ height: `${(day.visits / peak) * 100}%` }} />
                <span className="w-full max-w-2 rounded-t-sm bg-signal" style={{ height: `${(day.rooms / peak) * 100}%` }} />
                <span className="w-full max-w-2 rounded-t-sm bg-orange" style={{ height: `${(day.files / peak) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex min-w-[36rem] justify-between text-xs">
            <span>{data.series[0]?.day}</span>
            <span>{data.series[data.series.length - 1]?.day}</span>
          </div>
        </div>
      </section>

      <section className="rounded-[14px] border border-line bg-paper p-6">
        <h2 className="eyebrow">From visit to delivery</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-4">
          {funnel.map(([name, value], index) => (
            <li key={name} className="rounded-[14px] bg-sunken p-4">
              <p className="text-sm font-semibold text-sea-deep">{name}</p>
              <p className="digits mt-1 text-3xl">{number(value)}</p>
              {index > 0 && funnel[index - 1][1] > 0 && (
                <p className="mt-1 text-xs">
                  {Math.round((value / funnel[index - 1][1]) * 100)}% of the step before
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Breakdown title="Countries" rows={data.countries} tone="bg-sea" rename={(code) => `${flag(code)} ${countryName(code)}`} empty="Location appears once the site runs on its host." />
        <Breakdown title="Cities" rows={data.cities} tone="bg-sea" empty="Location appears once the site runs on its host." />
        <Breakdown title="Where visitors came from" rows={data.referrers} tone="bg-teal" />
        <Breakdown title="Device type" rows={data.devices} tone="bg-orange" />
        <Breakdown title="Operating system" rows={data.systems} tone="bg-orange" />
        <Breakdown title="Browser" rows={data.browsers} tone="bg-orange" />
        <Breakdown
          title="File types sent"
          rows={data.kinds}
          tone="bg-signal"
          rename={(name) => name[0].toUpperCase() + name.slice(1)}
          detail={(entry) => `${number(entry.value)}, ${bytes((entry as Entry & { bytes: number }).bytes)}`}
        />
        <Breakdown title="File extensions" rows={data.extensions} tone="bg-signal" />
        <Breakdown title="File sizes" rows={data.buckets} tone="bg-signal" />
        <Breakdown title="How files travelled" rows={data.routes} tone="bg-magenta" rename={(name) => routeNames[name] ?? name} />
        <Breakdown title="How devices joined" rows={data.joins} tone="bg-magenta" rename={(name) => joinNames[name] ?? name} />
        <Breakdown title="Pages viewed" rows={data.pages} tone="bg-blue" />
      </div>

      <section className="rounded-[14px] border border-line bg-paper p-6">
        <h2 className="eyebrow">Latest activity</h2>
        {data.recent.length === 0 ? (
          <p className="mt-4 text-sm">Nothing recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="eyebrow">
                  <th className="py-2 pr-4 font-bold">When (UTC)</th>
                  <th className="py-2 pr-4 font-bold">What</th>
                  <th className="py-2 pr-4 font-bold">Detail</th>
                  <th className="py-2 pr-4 font-bold">Where</th>
                  <th className="py-2 font-bold">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.recent.map((event, index) => (
                  <tr key={index}>
                    <td className="py-2 pr-4 tabular-nums">
                      {new Date(event.at).toISOString().slice(5, 16).replace("T", " ")}
                    </td>
                    <td className="py-2 pr-4 font-semibold text-sea-deep">{eventNames[event.type] ?? event.type}</td>
                    <td className="py-2 pr-4">
                      {event.type === "file"
                        ? `${event.kind ?? "file"}${event.ext ? ` (.${event.ext})` : ""}, ${bytes(event.bytes ?? 0)}${event.route ? `, ${routeNames[event.route]?.toLowerCase() ?? event.route}` : ""}`
                        : event.type === "join"
                          ? (joinNames[event.via ?? ""] ?? "")
                          : (event.path ?? "")}
                    </td>
                    <td className="py-2 pr-4">
                      {event.country ? `${flag(event.country)} ${event.city ?? countryName(event.country)}` : ""}
                    </td>
                    <td className="py-2">{[event.device, event.os].filter(Boolean).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-sm">
        No file names, file contents or text are recorded. Visitors are counted with an ID that
        changes every day, so one person cannot be followed from day to day.
      </p>
    </div>
  );
}

export default function AdminPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  return (
    <div className="mx-auto max-w-[1304px] px-4 py-10 sm:px-6">
      <p className="eyebrow">Private</p>
      <h1 className="mb-8 mt-4 text-5xl">Admin</h1>
      <Suspense fallback={<p>Loading</p>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
