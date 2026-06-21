"use client";
import { useEffect, useMemo, useState } from "react";
import { sk, useAuth } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn, Inp } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";

// Content review pipeline (NOW plan E7). AI-generate + teacher review: drafts
// move draft → in_review → approved/published. Authors manage their own;
// approvers (admin / dept lead) act via the review_content RPC.

interface Item { id: string; title: string; kind: string; source: string; status: string; body: string | null; author_id: string; review_note: string | null; }

const STATUS_COLOR: Record<string, { c: string; b: string }> = {
  draft: { c: C.dim, b: C.bg }, in_review: { c: C.amb, b: C.ambS },
  approved: { c: C.grn, b: C.grnS }, published: { c: C.grn, b: C.grnS }, rejected: { c: C.red, b: C.redS },
};

function Pill({ s }: { s: string }) {
  const sc = STATUS_COLOR[s] || STATUS_COLOR.draft;
  return <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: sc.c, background: sc.b, padding: "2px 7px", borderRadius: 3 }}>{s.replace("_", " ")}</span>;
}

function ContentInner() {
  const { user, profile } = useAuth();
  const isApprover = profile?.role === "admin" || !!profile?.is_lead;
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("sow");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");

  const load = () => sk.q("content_items", { params: { select: "id,title,kind,source,status,body,author_id,review_note", order: "updated_at.desc", limit: "100" } }).then(setItems).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const mine = useMemo(() => items.filter((i) => i.author_id === user?.id), [items, user]);
  const queue = useMemo(() => items.filter((i) => i.status === "in_review"), [items]);
  const published = useMemo(() => items.filter((i) => i.status === "published" || i.status === "approved"), [items]);

  const create = async () => {
    if (!title.trim()) return;
    try { await sk.q("content_items", { method: "POST", body: { title: title.trim(), kind, body: body.trim() || null, source: "human" } }); setTitle(""); setBody(""); await load(); }
    catch (e: any) { setErr(e.message); }
  };
  const setStatus = async (id: string, status: string) => { await sk.q("content_items", { method: "PATCH", params: { id: `eq.${id}` }, body: { status } }).catch((e) => setErr(e.message)); await load(); };
  const review = async (id: string, decision: string) => {
    let note: string | null = null;
    if (decision === "rejected") { note = prompt("Reason (optional):") || null; }
    try { await sk.rpc("review_content", { p_id: id, p_decision: decision, p_note: note }); await load(); }
    catch (e: any) { setErr(e.message); }
  };

  const Row = ({ i, actions }: { i: Item; actions: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderTop: `1px solid ${C.rule}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{i.title} {i.source === "ai" && <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>· AI</span>}</div>
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>{i.kind}{i.review_note ? ` · note: ${i.review_note}` : ""}</div>
      </div>
      <Pill s={i.status} />
      {actions}
    </div>
  );

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 24, height: 1, background: C.dim }} /><span>Content</span></div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, marginBottom: 8 }}>Drafted, then <em style={{ fontStyle: "italic", color: C.grn }}>reviewed</em>.</h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, maxWidth: "52ch", lineHeight: 1.55 }}>AI-generated and human content goes through review before it reaches the shared catalogue.</p>
      {err && <div style={{ padding: "10px 14px", background: C.redS, border: `1px solid ${C.red}`, borderRadius: 6, color: C.red, fontSize: 13, marginBottom: 18 }}>{err}</div>}

      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 16, background: C.surface, marginBottom: 28 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>New draft</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <Inp placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ fontFamily: C.mono, fontSize: 13, padding: "9px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}>
            {["sow", "lesson", "questions", "revision", "note"].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Content (optional)" rows={3} style={{ width: "100%", fontFamily: C.sans, fontSize: 13, padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, color: C.text, resize: "vertical", marginBottom: 10 }} />
        <Btn onClick={create}>Save draft</Btn>
      </div>

      {isApprover && (
        <>
          <Sec>Review queue {queue.length > 0 && <span style={{ color: C.amb }}>· {queue.length}</span>}</Sec>
          <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface, marginBottom: 28 }}>
            {queue.length === 0 ? <div style={{ padding: 18, color: C.dim, fontFamily: C.mono, fontSize: 12 }}>Nothing awaiting review.</div> :
              queue.map((i) => <Row key={i.id} i={i} actions={<div style={{ display: "flex", gap: 6 }}>
                <Btn v="soft" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => review(i.id, "published")}>Publish</Btn>
                <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => review(i.id, "rejected")}>Reject</Btn>
              </div>} />)}
          </div>
        </>
      )}

      <Sec>Your drafts</Sec>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface, marginBottom: 28 }}>
        {mine.length === 0 ? <div style={{ padding: 18, color: C.dim, fontFamily: C.mono, fontSize: 12 }}>No drafts yet.</div> :
          mine.map((i) => <Row key={i.id} i={i} actions={
            i.status === "draft" ? <Btn v="soft" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setStatus(i.id, "in_review")}>Submit</Btn> :
            i.status === "in_review" ? <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setStatus(i.id, "draft")}>Withdraw</Btn> : <span />} />)}
      </div>

      {published.length > 0 && <>
        <Sec>Published catalogue</Sec>
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
          {published.map((i) => <Row key={i.id} i={i} actions={<span />} />)}
        </div>
      </>}
    </div>
  );
}

const Sec = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 12px", display: "flex", alignItems: "baseline", gap: 12 }}><span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} /><span>{children}</span><span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} /></div>
);

export default function ContentPage() {
  return <AppShell><ContentInner /></AppShell>;
}
