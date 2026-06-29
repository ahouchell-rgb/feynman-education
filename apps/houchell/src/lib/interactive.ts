// Origins for the two sibling apps that are surfaced as in-app tabs. Both are
// env-driven so prod / preview / local can differ; the defaults are the
// confirmed production domains. Once the whole estate sits behind
// houchelleducation.com these can point at internal paths.
// Canonical host is www (the apex 307-redirects there); pointing straight at it
// avoids a redirect hop on every embedded page and resources.json fetch.
export const INTERACTIVE_ORIGIN = (
  process.env.NEXT_PUBLIC_INTERACTIVE_ORIGIN || "https://www.interactive-science.com"
).replace(/\/$/, "");

export const RETRIEVAL_ORIGIN = (
  process.env.NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN || "https://retrieval-app.com"
).replace(/\/$/, "");

export const interactiveUrl = (href: string) =>
  `${INTERACTIVE_ORIGIN}/${String(href).replace(/^\//, "")}`;

export type Resource = {
  href: string;
  name: string;
  tag?: string;
  desc?: string;
  spec?: string;
  accent?: string;
  cat?: string;
  type?: string;
  level?: string;
  about?: string;
  tags?: string[];
  folder?: string;
};

export type Section = {
  id: string;
  title: string;
  blurb?: string;
  items: Resource[];
};

// resources.json is published at the interactive origin's root, so it stays the
// single source of truth — authoring a resource there makes it appear in these
// tabs automatically, no copy step in this repo.
export async function fetchResources(): Promise<Section[]> {
  const res = await fetch(`${INTERACTIVE_ORIGIN}/resources.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`resources.json → ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.sections) ? data.sections : [];
}
