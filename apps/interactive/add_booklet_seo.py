#!/usr/bin/env python3
"""Inject per-booklet SEO + structured data into each revision booklet's <head>.

Idempotent + marker-based, exactly like add_resize.py / add_retrieval_cta.py: a
marked block is replaced if already present, otherwise inserted just before
</head>. Re-run any time — safe. Only touches the 44 "revision" booklets listed
in resources.json (the standalone tool/widget pages are out of scope here).

Each booklet gets, inside <head>:
  1. LearningResource JSON-LD  — name, description, educationalLevel (KS3/GCSE),
     about + teaches (the topic), inLanguage "en-GB", url (canonical),
     learningResourceType, isAccessibleForFree. Built from resources.json, the
     same field set build.py already uses for the homepage ItemList.
  2. <link rel="canonical">    — origin + "/" + href.
  3. Open Graph + Twitter card — og:title/description/type/url + twitter:card
     (summary) etc. Reuses the site-wide og-image.png (same image index.html
     references); image tag is included because that asset exists at the origin.
  4. <html lang="en"> -> <html lang="en-GB">  (fixed outside the marker block).

FAQPage / Quiz JSON-LD is intentionally SKIPPED: resources.json has no
structured question/answer pairs to build it from, and fabricating Q&A would be
worse than omitting it.

Titles/descriptions for OG/Twitter prefer the booklet's own hand-authored
<title> and <meta name="description">; where a booklet lacks a meta description
we fall back to the manifest's `desc`.

Usage:  python3 add_booklet_seo.py
"""
import os
import re
import json
import html as htmllib

HERE = os.path.dirname(os.path.abspath(__file__))

START = "<!--ISCI-SEO:START"
END = "<!--ISCI-SEO:END-->"

# A site-wide social image lives at the origin root (same one index.html uses).
OG_IMAGE_FILE = "og-image.png"

_TAG_RE = re.compile(r"<[^>]+>")


def strip_tags(s):
    return _TAG_RE.sub("", s or "")


def clean_text(s):
    """Decode HTML entities (&#x27; &amp; …) to plain text, collapse whitespace."""
    return re.sub(r"\s+", " ", htmllib.unescape(strip_tags(s))).strip()


def attr_escape(s):
    """Escape for use inside a double-quoted HTML attribute."""
    return (
        s.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def educational_level(item):
    """Map the manifest `level` to a clean schema.org educationalLevel string."""
    lvl = (item.get("level") or "").strip()
    if lvl:
        return lvl
    # Fallback inference from `about` / tokens.
    blob = (item.get("about", "") + " " + item.get("tokens", "")).lower()
    return "GCSE" if "gcse" in blob else "Key Stage 3"


def existing_title(booklet_html, fallback):
    m = re.search(r"<title>(.*?)</title>", booklet_html, re.S)
    return clean_text(m.group(1)) if m else fallback


def existing_description(booklet_html, fallback):
    m = re.search(
        r'<meta\s+name="description"\s+content="(.*?)"', booklet_html, re.S
    )
    return clean_text(m.group(1)) if m else fallback


def seo_block(item, booklet_html, origin, og_image_url):
    href = item["href"]
    canonical = origin + "/" + href
    name = clean_text(item.get("name", "")) or existing_title(booklet_html, href)
    topic = item.get("about", "") or name
    level = educational_level(item)
    manifest_desc = clean_text(item.get("desc", ""))

    # OG/Twitter copy: prefer the booklet's own hand-authored head, fall back to
    # the manifest. JSON-LD description always uses the manifest desc.
    og_title = existing_title(booklet_html, name)
    og_desc = existing_description(booklet_html, manifest_desc)
    ld_desc = manifest_desc or og_desc

    ld = {
        "@context": "https://schema.org",
        "@type": "LearningResource",
        "name": name,
        "description": ld_desc,
        "url": canonical,
        "educationalLevel": level,
        "learningResourceType": item.get("type", "revision"),
        "inLanguage": "en-GB",
        "isAccessibleForFree": True,
        "about": {"@type": "Thing", "name": topic},
        "teaches": topic,
    }
    ld_json = json.dumps(ld, ensure_ascii=False, separators=(", ", ": "))

    lines = [
        f"{START} (auto-injected by add_booklet_seo.py; do not edit)-->",
        f'<link rel="canonical" href="{attr_escape(canonical)}">',
        '<meta property="og:type" content="article">',
        f'<meta property="og:title" content="{attr_escape(og_title)}">',
        f'<meta property="og:description" content="{attr_escape(og_desc)}">',
        f'<meta property="og:url" content="{attr_escape(canonical)}">',
        '<meta property="og:site_name" content="Interactive Science">',
        f'<meta property="og:image" content="{attr_escape(og_image_url)}">',
        '<meta name="twitter:card" content="summary">',
        f'<meta name="twitter:title" content="{attr_escape(og_title)}">',
        f'<meta name="twitter:description" content="{attr_escape(og_desc)}">',
        f'<meta name="twitter:image" content="{attr_escape(og_image_url)}">',
        '<script type="application/ld+json">' + ld_json + "</script>",
        END,
    ]
    return "\n".join(lines)


def fix_lang(html):
    """<html lang="en"> -> <html lang="en-GB"> (leave en-GB / others alone)."""
    return re.sub(
        r'(<html\b[^>]*\blang=")en(")', r"\1en-GB\2", html, count=1
    )


def inject_head(html, block):
    marker_re = re.compile(re.escape(START) + ".*?" + re.escape(END), re.S)
    if marker_re.search(html):
        return marker_re.sub(lambda m: block, html, count=1), "updated"
    if "</head>" in html:
        idx = html.find("</head>")
        return html[:idx] + block + "\n" + html[idx:], "inserted"
    return html, "SKIP (no </head>)"


def main():
    manifest = json.load(
        open(os.path.join(HERE, "resources.json"), encoding="utf-8")
    )
    origin = manifest["site"]["origin"].rstrip("/")
    og_image_url = (
        origin + "/" + OG_IMAGE_FILE
        if os.path.exists(os.path.join(HERE, OG_IMAGE_FILE))
        else None
    )

    booklets = []
    for section in manifest.get("sections", []):
        if section.get("id") != "revision":
            continue
        booklets.extend(section.get("items", []))

    counts = {"inserted": 0, "updated": 0, "lang-fixed": 0, "skip": 0}
    for item in booklets:
        path = os.path.join(HERE, item["href"])
        if not os.path.exists(path):
            counts["skip"] += 1
            print("skip ", item["href"], "(file not found)")
            continue
        html = open(path, encoding="utf-8").read()
        original = html

        block = seo_block(item, html, origin, og_image_url)
        # If no og-image asset, drop the two image tags rather than invent a path.
        if og_image_url is None:
            block = "\n".join(
                ln for ln in block.split("\n")
                if "og:image" not in ln and "twitter:image" not in ln
            )

        html, action = inject_head(html, block)
        fixed = fix_lang(html)
        lang_changed = fixed != html
        html = fixed

        if html != original:
            open(path, "w", encoding="utf-8").write(html)
        if action in counts:
            counts[action] += 1
        else:
            counts["skip"] += 1
        if lang_changed:
            counts["lang-fixed"] += 1
        print("seo  ", item["href"], "->", action,
              ("(+lang)" if lang_changed else ""))

    print("\n" + ", ".join(f"{k}: {v}" for k, v in counts.items()))
    print(f"covered {len(booklets)} booklets; og:image = "
          f"{og_image_url or 'OMITTED (asset missing)'}")


if __name__ == "__main__":
    main()
