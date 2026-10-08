import { comparisons, findComparison } from "@/lib/compare";
import { ogImage, ogSize, ogType } from "@/lib/og";
import { site } from "@/lib/site";

export const alt = `${site.name} compared`;
export const size = ogSize;
export const contentType = ogType;

export function generateStaticParams() {
  return comparisons.map((entry) => ({ slug: entry.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const entry = findComparison((await params).slug);
  return ogImage({
    eyebrow: "Compare",
    title: entry ? `${site.name} vs ${entry.name}` : site.name,
    subtitle: entry ? entry.title.split(": ")[1].replace(/^./, (c) => c.toUpperCase()) : undefined,
    tone: entry?.tone,
    chips: ["Side by side", "Which to use when"],
  });
}
