// Download a saved half-term feedforward deck as .pptx.
// GET /api/feedforward-deck/<id>   Authorization: Bearer <user JWT>
// RLS on feedforward_decks ensures a teacher only gets their own decks.
import { supaRest } from "@/lib/supabaseRest";
import { SK_ANON, SK_URL } from "@/lib/serverHelpers";

export const runtime = "nodejs";


export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("unauthorized", { status: 401 });
  const token = auth.slice(7);

  let row: any;
  try {
    row = await supaRest(SK_URL, "feedforward_decks", {
      params: { id: `eq.${params.id}`, select: "class_label,half_term,pptx_base64" },
      apikey: SK_ANON, bearer: token, single: true,
    });
  } catch { return new Response("not found", { status: 404 }); }
  if (!row?.pptx_base64) return new Response("not found", { status: 404 });

  const buf = Buffer.from(row.pptx_base64, "base64");
  const name = `${(row.class_label || "class").replace(/[^\w-]/g, "_")}-${(row.half_term || "feedforward").replace(/[^\w-]/g, "_")}.pptx`;
  return new Response(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
}
