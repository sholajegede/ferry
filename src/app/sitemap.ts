import type { MetadataRoute } from "next";
import { comparisons } from "@/lib/compare";
import { published } from "@/lib/seo";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = published;
  return [
    { url: `${site.url}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${site.url}/offline`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${site.url}/compare`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    ...comparisons.map((entry) => ({
      url: `${site.url}/compare/${entry.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${site.url}/developers`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${site.url}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site.url}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
