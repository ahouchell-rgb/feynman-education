"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { sb } from "../../../lib/supabase";
import { C } from "../../../lib/theme";
import { Card, Btn, Badge } from "../../../components/ui";

/* /topic/[id] — embeddable retrieval-practice PREVIEW for a single topic.
 * Deep-link target for the ScienceKit lesson-page embed (RetrievalAppFrame).
 * Shows the topic's questions read-only (no model answers — see the
 * topic_preview_questions RPC) so a teacher can see / project what pupils get.
 * Works without login (anon RPC + anon-readable topic name) because an embedded
 * iframe gets partitioned storage and can't see the viewer's session. The
 * answerable practice lives in the authed top-level app. */
export default function TopicPreviewPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [topic, setTopic] = useState(undefined); // undefined = loading, null = not found
  const [questions, setQuestions] = useState(null); // null = loading
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    if (!id) return;
    (async () => {
      try {
        const t = await sb.q("topics", { params: { id: `eq.${id}`, select: "name,key_stage" }, single: true });
        if (live) setTopic(t || null);
      } catch { if (live) setTopic(null); }
      try {
        const qs = await sb.rpc("topic_preview_questions", { p_topic_id: id });
        if (live) setQuestions(Array.isArray(qs) ? qs : []);
      } catch (e) { if (live) { setQuestions([]); setErr(e.message || "Couldn't load questions"); } }
    })();
    return () => { live = false; };
  }, [id]);

  const wrap = (children) => (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans, color: C.txt, padding: "22px 18px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>{children}</div>
    </div>
  );

  if (topic === undefined || questions === null) {
    return wrap(<div style={{ color: C.dim, fontSize: 13 }}>Loading retrieval…</div>);
  }
  if (topic === null) {
    return wrap(<Card style={{ padding: 20 }}><div style={{ fontSize: 14, color: C.mid }}>Topic not found.</div></Card>);
  }

  return wrap(
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: C.pri }}>Retrieval practice</div>
        {topic.key_stage ? <Badge color={C.acc}>{topic.key_stage}</Badge> : null}
      </div>
      <div style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", marginBottom: 12 }}>{topic.name}</div>

      {questions.length === 0 ? (
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 13, color: C.mid }}>{err || "No questions for this topic yet."}</div>
        </Card>
      ) : (
        <>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>
            {questions.length} question{questions.length === 1 ? "" : "s"} · model answers hidden — open the app to practise
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {questions.map((q, i) => (
              <Card key={q.id} style={{ padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontFamily: C.serif, fontSize: 16, color: C.dim, minWidth: 22, textAlign: "right" }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, lineHeight: 1.4 }}>{q.question_text}</div>
                  {q.image_url ? <img src={q.image_url} alt="" style={{ maxWidth: "100%", marginTop: 8, borderRadius: 4, border: `1px solid ${C.bdr}` }} /> : null}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: C.mid, whiteSpace: "nowrap" }}>{q.marks} mark{q.marks === 1 ? "" : "s"}</span>
              </Card>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <Btn onClick={() => window.open("/", "_blank", "noopener")}>Open in retrieval app ↗</Btn>
      </div>
    </>
  );
}
