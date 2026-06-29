#!/usr/bin/env python3
"""Inject a "practise this with retrieval" call-to-action onto every standalone
widget/revision page, turning the site into a top-of-funnel for the retrieval app.

Idempotent + marker-based, exactly like add_resize.py: a marked block is replaced
if already present, otherwise inserted before </body>. Re-run any time — safe.

  - Targets every top-level *.html EXCEPT index.html (which already has the
    "companion sites" band).
  - SKIPS fullscreen app pages (html/body { overflow:hidden }) where a footer
    band would be clipped off-screen and never seen.
  - Reads resources.json to personalise the copy by subject (cat) and to pick up
    the destination URL from site.retrieval_url (single source of truth), and tags
    the link with ?ref=interactive-science&from=<page> for attribution.

Usage:  python3 add_retrieval_cta.py
"""
import os
import re
import json
import glob

HERE = os.path.dirname(os.path.abspath(__file__))

START = "<!--ISCI-RETRIEVAL-CTA:START"
END = "<!--ISCI-RETRIEVAL-CTA:END-->"

# Subject word for the personalised line; falls back to "this topic".
SUBJECT = {
    "biology": "biology",
    "physics": "physics",
    "chemistry": "chemistry",
    "environmental": "environmental science",
}

# A fullscreen app page (overflow:hidden on html/body) clips anything appended
# before </body>, so a CTA there is invisible — skip those.
FULLSCREEN_RE = re.compile(r"(?:html|body)[^{]{0,80}\{[^{}]{0,400}?overflow\s*:\s*hidden", re.I)


def cta_block(slug, subject_word, retrieval_url):
    sep = "&" if "?" in retrieval_url else "?"
    url = f"{retrieval_url}{sep}ref=interactive-science&from={slug}"
    return (
        f"{START} (auto-injected by add_retrieval_cta.py; do not edit)-->\n"
        '<aside style="max-width:680px;margin:48px auto 32px;padding:24px 28px;'
        "border:1px solid #d7ddd4;border-left:4px solid #2E7D4F;border-radius:12px;"
        "background:#f6f9f4;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;"
        'color:#1d2a20;box-sizing:border-box;line-height:1.5;">\n'
        '  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;'
        'color:#2E7D4F;font-weight:700;margin-bottom:6px;">Make it stick</div>\n'
        '  <div style="font-size:19px;font-weight:600;line-height:1.35;margin-bottom:6px;">'
        "You&rsquo;ve revised it &mdash; now lock it into memory.</div>\n"
        '  <div style="font-size:14px;color:#48564a;margin-bottom:16px;">'
        f"Practise {subject_word} with short, self-marking retrieval questions, "
        "spaced just right so it actually sticks.</div>\n"
        f'  <a href="{url}" style="display:inline-block;background:#2E7D4F;color:#fff;'
        "text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;"
        'border-radius:8px;">Practise this in the retrieval app &rarr;</a>\n'
        "</aside>\n"
        f"{END}"
    )


def inject(path, block):
    html = open(path, encoding="utf-8").read()
    marker_re = re.compile(re.escape(START) + ".*?" + re.escape(END), re.S)
    if marker_re.search(html):
        new = marker_re.sub(lambda m: block, html, count=1)
        action = "updated"
    elif "</body>" in html:
        idx = html.rfind("</body>")
        new = html[:idx] + block + "\n" + html[idx:]
        action = "inserted"
    else:
        return "SKIP (no </body>)"
    if new != html:
        open(path, "w", encoding="utf-8").write(new)
    return action


def main():
    manifest = json.load(open(os.path.join(HERE, "resources.json"), encoding="utf-8"))
    retrieval_url = manifest.get("site", {}).get("retrieval_url", "https://retrieval-app.com")
    by_href = {}
    for section in manifest.get("sections", []):
        for item in section.get("items", []):
            if item.get("href"):
                by_href[item["href"]] = item

    counts = {"inserted": 0, "updated": 0, "skip-fullscreen": 0, "skip-other": 0}
    for path in sorted(glob.glob(os.path.join(HERE, "*.html"))):
        name = os.path.basename(path)
        if name == "index.html":
            continue
        html = open(path, encoding="utf-8").read()
        # Don't add a CTA to an already-injected page's fullscreen check — but DO let
        # idempotent updates through (re-running must refresh existing blocks).
        if START not in html and FULLSCREEN_RE.search(html):
            counts["skip-fullscreen"] += 1
            print("skip ", name, "(fullscreen app)")
            continue
        item = by_href.get(name, {})
        subject_word = SUBJECT.get(item.get("cat"), "this topic")
        slug = name[:-5] if name.endswith(".html") else name
        action = inject(path, cta_block(slug, subject_word, retrieval_url))
        if action in counts:
            counts[action] += 1
        else:
            counts["skip-other"] += 1
        print("cta  ", name, "->", action, f"({subject_word})")

    print("\n" + ", ".join(f"{k}: {v}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
