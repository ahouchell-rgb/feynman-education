#!/usr/bin/env python3
"""Inject the iframe auto-resize scripts. Idempotent + marker-based, like build.py.

  - SENDER -> every interactives/*.html: posts its rendered content height to the
              host page (cross-origin safe; only a height number is sent).
  - HOST   -> every top-level *.html that embeds an interactives/*.html iframe:
              listens for those messages and sets the matching iframe's height,
              so embeds never clip or show an inner scrollbar.

A marked block is replaced if already present, otherwise inserted before </body>.
Run after adding a new widget or a new page that embeds one.

Cross-app note: to auto-fit an interactive-science widget embedded in another site
(e.g. the Houchell lesson page), paste the HOST block into that page's host window.

Usage:  python3 add_resize.py
"""
import os
import re
import glob

HERE = os.path.dirname(os.path.abspath(__file__))

SENDER = (
    "<!--ISCI-RESIZE-SENDER:START (auto-injected by add_resize.py; do not edit)-->\n"
    "<script>/* interactive-science: report our height so a host iframe can auto-fit */\n"
    "(function(){if(window.parent===window)return;var last=0,t=0;"
    "function H(){var d=document.documentElement,b=document.body;"
    "return Math.ceil(Math.max(d.scrollHeight,b?b.scrollHeight:0,b?b.offsetHeight:0,"
    "d.getBoundingClientRect().height));}"
    "function send(){var h=H();if(h>0&&h!==last){last=h;"
    "try{parent.postMessage({type:'iscience:resize',height:h},'*');}catch(e){}}}"
    "function schedule(){clearTimeout(t);t=setTimeout(send,50);}"  # setTimeout, not rAF: fires even when the iframe is offscreen
    "if(document.readyState!=='loading')schedule();"
    "document.addEventListener('DOMContentLoaded',schedule);"
    "window.addEventListener('load',function(){[0,200,600,1200,2500].forEach(function(ms){setTimeout(send,ms);});});"  # catch late-drawn content (charts, fonts)
    "window.addEventListener('resize',schedule);"
    "['click','input','change','transitionend'].forEach(function(ev){"
    "document.addEventListener(ev,schedule,true);});"  # interactive widgets that grow/shrink
    "if(window.ResizeObserver){try{var ro=new ResizeObserver(schedule);"
    "ro.observe(document.documentElement);if(document.body)ro.observe(document.body);}catch(e){}}"
    "if(window.MutationObserver){try{new MutationObserver(schedule).observe(document.documentElement,"
    "{subtree:true,childList:true,attributes:true,characterData:true});}catch(e){}}"
    "})();</script>\n"
    "<!--ISCI-RESIZE-SENDER:END-->"
)

HOST = (
    "<!--ISCI-RESIZE-HOST:START (auto-injected by add_resize.py; do not edit)-->\n"
    "<script>/* interactive-science: auto-resize embedded interactives/*.html iframes */\n"
    "(function(){function fit(src,h){var f=document.getElementsByTagName('iframe');"
    "for(var i=0;i<f.length;i++){if(f[i].contentWindow===src){f[i].style.height=Math.ceil(h)+'px';return;}}}"
    "window.addEventListener('message',function(e){var d=e.data;"
    "if(d&&d.type==='iscience:resize'&&typeof d.height==='number'&&d.height>0&&d.height<20000){"
    "fit(e.source,d.height);}});})();</script>\n"
    "<!--ISCI-RESIZE-HOST:END-->"
)


def inject(path, block, start_marker, end_marker):
    html = open(path, encoding="utf-8").read()
    marker_re = re.compile(re.escape(start_marker) + ".*?" + re.escape(end_marker), re.S)
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


# 1. SENDER into every widget.
for p in sorted(glob.glob(os.path.join(HERE, "interactives", "*.html"))):
    print("sender", os.path.relpath(p, HERE),
          inject(p, SENDER, "<!--ISCI-RESIZE-SENDER:START", "<!--ISCI-RESIZE-SENDER:END-->"))

# 2. HOST into every top-level page that embeds a widget.
for p in sorted(glob.glob(os.path.join(HERE, "*.html"))):
    if 'src="interactives/' in open(p, encoding="utf-8").read():
        print("host  ", os.path.basename(p),
              inject(p, HOST, "<!--ISCI-RESIZE-HOST:START", "<!--ISCI-RESIZE-HOST:END-->"))
