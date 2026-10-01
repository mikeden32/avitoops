import type { MetadataRoute } from "next";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return ["/", "/tariffs", "/contacts", "/offer", "/consent", "/login", "/register"].map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
