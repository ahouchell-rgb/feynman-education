"use client";
import { useMemo, useState, useRef, useEffect } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";

/* ─── Wrap user HTML so runtime errors paint a visible overlay inside the iframe.
   The sandbox already isolates crashes from breaking the parent page; this just
   gives the teacher a clear signal to "edit or remove" when a widget misbehaves. */
function wrapHtmlForSandbox(html) {
  const safeHtml = typeof html === "string" ? html : "";
  // The boot script runs BEFORE the user's HTML. It installs error listeners
  // that surface an overlay if anything throws — synchronous or in a promise.
  // We keep the listeners scoped to this document only.
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  #__sk_err {
    position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
    background: rgba(243,238,226,0.94); padding: 24px; z-index: 2147483647;
  }
  #__sk_err .box {
    max-width: 520px; background: #fff; border: 1px solid #b8b1a0; border-radius: 8px;
    padding: 18px 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  }
  #__sk_err h3 { margin: 0 0 8px; font-size: 14px; color: #b95a3c; font-weight: 600; letter-spacing: 0.02em; }
  #__sk_err pre {
    margin: 0; font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace; font-size: 12px;
    color: #1a1714; white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow: auto;
  }
  #__sk_err small { display: block; margin-top: 10px; color: #8c8678; font-size: 11px; }
</style>
<script>
  (function () {
    function show(msg) {
      var el = document.getElementById("__sk_err");
      if (!el) {
        // DOM not ready yet — try again on DOMContentLoaded.
        document.addEventListener("DOMContentLoaded", function () { show(msg); }, { once: true });
        return;
      }
      el.querySelector("pre").textContent = String(msg || "Unknown error");
      el.style.display = "flex";
    }
    window.addEventListener("error", function (e) {
      show((e && e.error && e.error.stack) || (e && e.message) || "Error");
    });
    window.addEventListener("unhandledrejection", function (e) {
      var r = e && e.reason;
      show((r && r.stack) || (r && r.message) || String(r) || "Promise rejection");
    });
  })();
</script>
</head>
<body>
<div id="__sk_err"><div class="box">
  <h3>Widget error</h3>
  <pre></pre>
  <small>This widget threw an error. Edit or remove it from the lesson page.</small>
</div></div>
${safeHtml}
<script>
  /* iscience-embed relay: auto-fit the sandbox to its content and bubble height up
     to the React WidgetBlock. Covers two cases: (a) self-contained widgets (measure
     this document); (b) nested interactive-science.com iframes (size the inner frame
     on its iscience:resize message, then re-measure). Sandbox is allow-scripts only,
     so this posts to parent with an opaque "null" origin — the host matches by source. */
  (function () {
    function ownHeight() {
      var d = document.documentElement, b = document.body;
      return Math.ceil(Math.max(d.scrollHeight, b ? b.scrollHeight : 0,
        b ? b.offsetHeight : 0, d.getBoundingClientRect().height));
    }
    var last = 0, t = 0;
    function pushUp() {
      var h = ownHeight();
      if (h > 0 && h !== last) { last = h; try { parent.postMessage({ type: "iscience:resize", height: h }, "*"); } catch (e) {} }
    }
    function schedule() { clearTimeout(t); t = setTimeout(pushUp, 50); }
    window.addEventListener("message", function (e) {
      var m = e.data;
      if (m && m.type === "iscience:resize" && typeof m.height === "number" && m.height > 0 && m.height < 20000) {
        var f = document.getElementsByTagName("iframe");
        for (var i = 0; i < f.length; i++) { if (f[i].contentWindow === e.source) { f[i].style.height = Math.ceil(m.height) + "px"; break; } }
        schedule();
      }
    });
    if (document.readyState !== "loading") schedule();
    document.addEventListener("DOMContentLoaded", schedule);
    window.addEventListener("load", function () { [0, 200, 600, 1200, 2500].forEach(function (ms) { setTimeout(pushUp, ms); }); });
    window.addEventListener("resize", schedule);
    ["click", "input", "change", "transitionend"].forEach(function (ev) { document.addEventListener(ev, schedule, true); });
    if (window.ResizeObserver) { try { var ro = new ResizeObserver(schedule); ro.observe(document.documentElement); if (document.body) ro.observe(document.body); } catch (e) {} }
    if (window.MutationObserver) { try { new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); } catch (e) {} }
  })();
</script>
</body>
</html>`;
}

/* ─── Inline widget renderer (used on the lesson page). */
export function WidgetBlock({ widget, onEdit, onDelete, onMoveUp, onMoveDown, onFullscreen, canMoveUp, canMoveDown, isAdmin }) {
  const srcDoc = useMemo(() => wrapHtmlForSandbox(widget.html), [widget.html]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(widget.default_height || 480);
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data;
      if (d && d.type === "iscience:resize" && typeof d.height === "number" &&
          d.height > 0 && d.height < 20000 &&
          iframeRef.current && e.source === iframeRef.current.contentWindow) {
        setHeight(Math.ceil(d.height));
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      overflow: "hidden",
      marginBottom: 12,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 12px", borderBottom: `1px solid ${C.border}`, background: C.bg,
      }}>
        <span style={{
          fontFamily: C.mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
          color: C.blu, padding: "3px 7px", border: `1px solid ${C.blu}`, borderRadius: 3,
        }}>WIDGET</span>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {widget.title || "Widget"}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <Btn v="ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => onMoveUp(widget)} disabled={!canMoveUp} title="Move up">↑</Btn>
          <Btn v="ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => onMoveDown(widget)} disabled={!canMoveDown} title="Move down">↓</Btn>
          <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => onFullscreen(widget)}>Fullscreen</Btn>
          {isAdmin && <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => onEdit(widget)}>Edit</Btn>}
          {isAdmin && (
            <Btn v="ghost"
              style={{ fontSize: 11, padding: "4px 10px", color: C.red, borderColor: "rgba(153,27,27,0.2)" }}
              onClick={() => onDelete(widget)}>
              ×
            </Btn>
          )}
        </div>
      </div>
      <iframe
        ref={iframeRef}
        title={widget.title || "Widget"}
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="lazy"
        style={{ width: "100%", height, border: "none", background: "#fff", display: "block" }}
      />
    </div>
  );
}

/* ─── Fullscreen overlay — mirrors ResourceViewer pattern. */
export function WidgetFullscreen({ widget, onClose }) {
  const srcDoc = useMemo(() => wrapHtmlForSandbox(widget.html), [widget.html]);
  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 300, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "12px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface, gap: 12 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.muted, lineHeight: 1 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{widget.title || "Widget"}</div>
          <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, letterSpacing: "0.04em" }}>Interactive widget</div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden", background: "#fff" }}>
        <iframe
          title={widget.title || "Widget"}
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={{ width: "100%", height: "100%", border: "none", background: "#fff", display: "block" }}
        />
      </div>
    </div>
  );
}
