"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth, sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";

/* ─── Helpers ───────────────────────────────────────────────────────── */

// Match ```html ... ``` code blocks. Tolerates leading whitespace, optional
// language hint variations (`html`, `HTML`). Ignores blocks without a closing
// fence — so we don't surface "Add to lesson" mid-stream on a partial block.
function extractHtmlBlocks(content) {
  const blocks = [];
  if (!content) return blocks;
  const re = /```(?:html|HTML)\s*\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(content)) !== null) blocks.push(m[1]);
  return blocks;
}

/* ─── Message bubble ────────────────────────────────────────────────── */
function MessageBubble({ msg, onAddWidget, streaming, addedFlash }) {
  const isUser = msg.role === "user";
  const blocks = !isUser && !streaming ? extractHtmlBlocks(msg.content) : [];

  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: 8,
      background: isUser ? C.bg : C.surface,
      border: `1px solid ${isUser ? C.border : C.borderStrong}`,
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "92%",
    }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
        {isUser ? "You" : "Claude"}{streaming ? " · typing…" : ""}
      </div>
      <div style={{
        fontSize: 13, lineHeight: 1.6, color: C.text,
        whiteSpace: "pre-wrap",
        fontFamily: isUser ? C.mono : C.sans,
        wordBreak: "break-word",
      }}>
        {msg.content || (streaming ? "…" : "")}
      </div>
      {blocks.map((html, i) => {
        const flashed = addedFlash?.[`${msg.id}:${i}`];
        return (
          <div key={i} style={{
            marginTop: 8, padding: "6px 10px",
            background: flashed ? C.grnS : C.bg,
            border: `1px solid ${flashed ? C.grn : C.border}`,
            borderRadius: 6, display: "flex", alignItems: "center", gap: 10,
            transition: "all .15s",
          }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.blu, fontWeight: 600, letterSpacing: "0.1em" }}>HTML</span>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, flex: 1 }}>
              {flashed ? "Added ✓" : `Widget block · ${html.length} chars`}
            </span>
            <Btn v={flashed ? "soft" : "soft"}
              style={{ fontSize: 11, padding: "4px 10px", ...(flashed ? { color: C.grn, borderColor: C.grn } : {}) }}
              onClick={() => !flashed && onAddWidget(html, msg.id, i)}>
              {flashed ? "Added" : "Add to lesson"}
            </Btn>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Sidebar ───────────────────────────────────────────────────────── */
export function ChatSidebar({ open, onClose, lesson, onWidgetCreated }) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(null);
  const [addedFlash, setAddedFlash] = useState({}); // key `${msgId}:${blockIdx}` → true
  const scrollerRef = useRef(null);
  const abortRef = useRef(null);

  // Load chat history when opened (or when lesson changes while open)
  useEffect(() => {
    if (!open || !lesson?.id || !profile?.id) return;
    let alive = true;
    (async () => {
      try {
        const hist = await sk.q("lesson_chat_messages", {
          params: {
            lesson_id: `eq.${lesson.id}`,
            teacher_id: `eq.${profile.id}`,
            order: "created_at.asc",
            limit: "100",
          },
        });
        if (alive) setMessages(hist || []);
      } catch (e) {
        if (alive) setError(`Couldn't load history: ${e.message}`);
      }
    })();
    return () => { alive = false; };
  }, [open, lesson?.id, profile?.id]);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages]);

  // Cancel in-flight request on close/unmount
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setError("");
    setInput("");

    const tmpUserId = `tmp-u-${Date.now()}`;
    const tmpAsstId = `tmp-a-${Date.now()}`;

    setMessages(prev => [
      ...prev,
      { id: tmpUserId, role: "user", content: text },
      { id: tmpAsstId, role: "assistant", content: "", _streaming: true },
    ]);
    setStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const session = sk.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");

      const r = await fetch("/api/chat-with-lesson", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ lessonId: lesson.id, userMessage: text }),
        signal: abort.signal,
      });

      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            let evt;
            try { evt = JSON.parse(data); } catch { continue; }

            if (evt.type === "text") {
              acc += evt.content;
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last._streaming) {
                  next[next.length - 1] = { ...last, content: acc };
                }
                return next;
              });
            } else if (evt.type === "done") {
              setUsage(evt.usage);
            } else if (evt.type === "warning") {
              setError(evt.message); // surfaced but non-fatal
            } else if (evt.type === "error") {
              setError(evt.message);
            }
          }
        }
      }

      // Finalize the streaming message
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last._streaming) {
          next[next.length - 1] = { ...last, _streaming: false };
        }
        return next;
      });
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
      // Strip the placeholder assistant bubble if it's empty
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last._streaming && !last.content) return prev.slice(0, -1);
        return prev.map(m => m._streaming ? { ...m, _streaming: false } : m);
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const addAsWidget = async (html, msgId, blockIdx) => {
    try {
      // Position: simple monotonically increasing — chat additions go to end.
      // The lesson page's regular reorder buttons can rearrange afterwards.
      const nextPos = Math.floor(Date.now() / 1000);
      const titleFromContext = `From chat · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
      await sk.q("lesson_widgets", {
        method: "POST",
        body: {
          lesson_id: lesson.id,
          teacher_id: profile.id,
          title: titleFromContext,
          html,
          default_height: 480,
          position: nextPos,
        },
      });
      setAddedFlash(prev => ({ ...prev, [`${msgId}:${blockIdx}`]: true }));
      onWidgetCreated?.();
    } catch (e) {
      setError(`Couldn't add widget: ${e.message}`);
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 480, maxWidth: "100vw",
      background: C.surface, borderLeft: `1px solid ${C.borderStrong}`,
      display: "flex", flexDirection: "column",
      zIndex: 250, boxShadow: "-4px 0 16px rgba(0,0,0,0.06)",
    }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Chat with Claude
          </div>
          <div style={{ fontFamily: C.serif, fontSize: 16, color: C.text, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lesson?.title}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close chat"
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: C.muted, lineHeight: 1 }}>
          ×
        </button>
      </div>

      <div ref={scrollerRef}
        style={{ flex: 1, overflow: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.length === 0 && !streaming && (
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, padding: 12, lineHeight: 1.7 }}>
            Ask Claude about this lesson. Examples:
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, color: C.muted }}>
              <div>· Build me a drag-and-drop sorter for organelles</div>
              <div>· Suggest 6 exam-style questions on photosynthesis</div>
              <div>· Rewrite the objectives for foundation tier</div>
              <div>· Make a 1-minute retrieval starter on Group 7</div>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id || i}
            msg={m}
            streaming={m._streaming}
            addedFlash={addedFlash}
            onAddWidget={addAsWidget}
          />
        ))}
      </div>

      {error && (
        <div style={{ padding: "8px 18px", background: C.redS, color: C.red, fontFamily: C.mono, fontSize: 11, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError("")} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, fontSize: 14 }}>×</button>
        </div>
      )}
      {usage && !error && (
        <div style={{ padding: "6px 18px", borderTop: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 10, color: C.dim, display: "flex", justifyContent: "space-between" }}>
          <span>Last reply: {usage.inputTokens ?? 0}↑ {usage.outputTokens ?? 0}↓ tok</span>
          <span>£{(usage.costGBP ?? 0).toFixed(4)}</span>
        </div>
      )}

      <div style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask anything about this lesson…  (⌘↵ to send)"
          rows={3}
          disabled={streaming}
          style={{
            width: "100%", padding: "10px 12px",
            border: `1px solid ${C.border}`, borderRadius: 6,
            fontFamily: C.mono, fontSize: 12, lineHeight: 1.5,
            background: C.bg, color: C.text, outline: "none",
            resize: "none",
            opacity: streaming ? 0.6 : 1,
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn onClick={send} disabled={streaming || !input.trim()}>
            {streaming ? "Thinking…" : "Send"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
