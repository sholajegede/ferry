import Link from "next/link";
import { SendButton } from "@/components/home-actions";
import { checked, comparisons } from "@/lib/compare";
import { breadcrumbs, JsonLd, pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";

const title =
  "Ferry compared: WeTransfer, AirDrop, PairDrop, Send Anywhere, LocalSend";
const description =
  "Honest comparisons between Ferry and the best known ways to send files, with a short answer on which one to use for the file in front of you.";

export const metadata = pageMeta({
  image: "compare",
  title,
  description,
  path: "/compare",
  absoluteTitle: true,
});

const tones: Record<string, string> = {
  purple: "bg-lilac",
  green: "bg-mint",
  peach: "bg-peach",
  night: "bg-pink",
  cream: "bg-sunken",
};

const picks = [
  {
    need: "Both devices are here and the file is large or private",
    pick: "Ferry",
  },
  {
    need: "The other person will download tomorrow",
    pick: "WeTransfer or a Send Anywhere link",
  },
  { need: "iPhone to Mac, side by side", pick: "AirDrop" },
  { need: "iPhone to Windows, or Android to Mac", pick: "Ferry" },
  { need: "You want to self-host on one small server", pick: "PairDrop" },
  { need: "One home network, app installed everywhere", pick: "LocalSend" },
  { need: "No internet, nothing installed", pick: "Ferry offline mode" },
];

export default function ComparePage() {
  return (
    <div className="mx-auto max-w-[1304px] px-4 py-10 sm:px-6">
      <JsonLd
        graph={[
          breadcrumbs([{ name: "Compare", path: "/compare" }]),
          {
            "@type": "ItemList",
            name: title,
            itemListElement: comparisons.map((entry, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: entry.title,
              url: `${site.url}/compare/${entry.slug}`,
            })),
          },
        ]}
      />
      <p className="eyebrow">Compare</p>
      <h1 className="mt-6 max-w-4xl text-[2.6rem] sm:text-[3.4rem] lg:text-[4rem]">
        Which file transfer tool should you use?
      </h1>
      <p className="serif mt-5 max-w-3xl text-xl leading-snug sm:text-2xl">
        {site.name} sends files directly between two devices that are open at
        the same time. That makes it the right tool for some jobs and the wrong
        one for others. These pages say which.
      </p>

      <div className="mt-12 overflow-hidden rounded-[24px] border border-line bg-white">
        <table className="w-full text-left">
          <caption className="sr-only">
            Which tool to use for each situation
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="eyebrow px-5 py-4">
                If
              </th>
              <th scope="col" className="eyebrow px-5 py-4">
                Use
              </th>
            </tr>
          </thead>
          <tbody>
            {picks.map((row) => (
              <tr key={row.need} className="border-b border-line last:border-0">
                <td className="px-5 py-4 text-lg">{row.need}</td>
                <td className="px-5 py-4 text-lg font-semibold text-sea-deep">
                  {row.pick}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {comparisons.map((entry) => (
          <li key={entry.slug}>
            <Link
              href={`/compare/${entry.slug}`}
              className={`flex h-full min-h-64 flex-col rounded-[24px] p-6 transition-transform hover:-translate-y-0.5 ${tones[entry.tone]}`}
            >
              <span className="eyebrow">
                {site.name} vs {entry.name}
              </span>
              <span className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.02em] text-sea-deep">
                {entry.title}
              </span>
              <span className="serif mt-auto pt-6 text-lg leading-snug">
                {entry.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-sm text-ink/80">
        Details about other products were checked in {checked} and can change.
        Check their own sites before you rely on a limit or a price.
      </p>
      <div className="mt-8">
        <SendButton label={`Try ${site.name}`} />
      </div>
    </div>
  );
}
