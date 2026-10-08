import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SendButton } from "@/components/home-actions";
import { checked, comparisons, findComparison } from "@/lib/compare";
import { appId, breadcrumbs, faqPage, JsonLd, pageMeta, published } from "@/lib/seo";
import { site } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return comparisons.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: Props) {
  const entry = findComparison((await params).slug);
  if (!entry) return {};
  return pageMeta({
    title: entry.title,
    description: entry.description,
    path: `/compare/${entry.slug}`,
    type: "article",
    image: entry.slug,
  });
}

export default function ComparisonPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Comparison params={params} />
    </Suspense>
  );
}

async function Comparison({ params }: Props) {
  const entry = findComparison((await params).slug);
  if (!entry) notFound();
  const path = `/compare/${entry.slug}`;
  const others = comparisons.filter((other) => other.slug !== entry.slug);

  return (
    <article className="mx-auto max-w-[1304px] px-4 py-10 sm:px-6">
      <JsonLd
        graph={[
          breadcrumbs([
            { name: "Compare", path: "/compare" },
            { name: `${site.name} vs ${entry.name}`, path },
          ]),
          {
            "@type": "Article",
            headline: entry.title,
            description: entry.description,
            datePublished: published,
            dateModified: published,
            mainEntityOfPage: `${site.url}${path}`,
            image: `${site.url}/og/${entry.slug}.png`,
            author: { "@type": "Organization", name: site.name, url: site.url },
            publisher: { "@type": "Organization", name: site.name, url: site.url },
            about: [{ "@id": appId }, { "@type": "SoftwareApplication", name: entry.name }],
          },
          faqPage(entry.faqs),
        ]}
      />
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/compare" className="underline underline-offset-4">
          Compare
        </Link>{" "}
        / {site.name} vs {entry.name}
      </nav>
      <p className="eyebrow mt-8">
        {site.name} vs {entry.name}
      </p>
      <h1 className="mt-6 max-w-4xl text-[2.4rem] sm:text-[3.2rem] lg:text-[3.75rem]">{entry.title}</h1>
      <p className="mt-4 text-sm text-ink/80">Checked {checked}</p>

      <div className="mt-10 max-w-3xl rounded-[24px] bg-mint p-6 text-forest sm:p-8">
        <p className="eyebrow">The short answer</p>
        <p className="serif mt-4 text-xl leading-snug sm:text-2xl">{entry.answer}</p>
      </div>

      <div className="prose-doc mt-10 max-w-3xl">
        {entry.intro.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <h2 className="serif mt-14 text-3xl sm:text-4xl">Side by side</h2>
      <div className="mt-6 overflow-x-auto rounded-[24px] border border-line bg-white">
        <table className="w-full min-w-[640px] text-left">
          <caption className="sr-only">
            {site.name} and {entry.name} compared
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-1/5 px-5 py-4">
                <span className="sr-only">Feature</span>
              </th>
              <th scope="col" className="w-2/5 bg-lilac px-5 py-4 text-xl font-semibold text-sea-deep">
                {site.name}
              </th>
              <th scope="col" className="w-2/5 px-5 py-4 text-xl font-semibold">
                {entry.name}
              </th>
            </tr>
          </thead>
          <tbody>
            {entry.rows.map((row) => (
              <tr key={row.label} className="border-b border-line align-top last:border-0">
                <th scope="row" className="eyebrow px-5 py-4 font-normal">
                  {row.label}
                </th>
                <td className="bg-lilac/40 px-5 py-4">{row.ferry}</td>
                <td className="px-5 py-4">{row.them}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <section className="rounded-[24px] bg-lilac p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-sea-deep">
            Choose {site.name} when
          </h2>
          <ul className="mt-5 list-disc space-y-2.5 pl-5 text-lg leading-snug">
            {entry.ferryWhen.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-[24px] bg-sunken p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-sea-deep">
            Choose {entry.name} when
          </h2>
          <ul className="mt-5 list-disc space-y-2.5 pl-5 text-lg leading-snug">
            {entry.themWhen.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="prose-doc mt-4 max-w-3xl">
        {entry.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}

        <h2>Common questions</h2>
        {entry.faqs.map((faq) => (
          <div key={faq.q}>
            <h3>{faq.q}</h3>
            <p>{faq.a}</p>
          </div>
        ))}

        <h2>Sources</h2>
        <ul>
          {entry.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} rel="noopener noreferrer nofollow" target="_blank">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="!text-sm text-ink/80">
          Details about {entry.name} were checked in {checked} and can change. {entry.name} is a
          trademark of its owner, and {site.name} is not affiliated with it.
        </p>
      </div>

      <div className="mt-14 rounded-[40px] bg-sea p-8 text-on-sea sm:p-12">
        <h2 className="max-w-2xl text-4xl sm:text-5xl">Try it with the file you have now.</h2>
        <p className="serif mt-4 max-w-xl text-xl leading-snug">
          Open {site.name} on both devices and connect them with a QR code or six digits. There is
          no account to create.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          <SendButton tone="light" />
          <Link href="/#receive" className="pill h-10 border border-paper px-6 text-[0.8125rem] hover:bg-white/10">
            Receive files
          </Link>
        </div>
      </div>

      <nav aria-label="More comparisons" className="mt-14">
        <p className="eyebrow">More comparisons</p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {others.map((other) => (
            <li key={other.slug}>
              <Link
                href={`/compare/${other.slug}`}
                className="inline-flex h-10 items-center rounded-full border border-sea px-4 font-semibold hover:bg-sunken"
              >
                {site.name} vs {other.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
