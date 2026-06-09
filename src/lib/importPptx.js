// Best-effort PowerPoint (.pptx) importer → our deck format.
// Handles text boxes, rectangles/ellipses, images, and tables. Groups, charts,
// SmartArt and fancy effects are skipped or approximated.
import JSZip from "jszip";

const VW = 960, VH = 540;
const FONT_FACES = {
  arial: "'IBM Plex Sans', sans-serif", calibri: "'IBM Plex Sans', sans-serif", helvetica: "'IBM Plex Sans', sans-serif",
  georgia: "Georgia, serif", "times new roman": "'Times New Roman', serif", cambria: "Georgia, serif",
  "comic sans ms": "'Comic Sans MS', sans-serif", verdana: "Verdana, sans-serif", consolas: "'IBM Plex Mono', monospace", "courier new": "'IBM Plex Mono', monospace",
};

const ln = (n) => n.localName || (n.tagName || "").replace(/^.*:/, "");
const kids = (el, name) => (el ? Array.from(el.children).filter((c) => ln(c) === name) : []);
const first = (el, name) => kids(el, name)[0] || null;
const desc = (el, name) => { const out = []; const walk = (n) => { for (const c of n.children || []) { if (ln(c) === name) out.push(c); walk(c); } }; if (el) walk(el); return out; };
const firstDesc = (el, name) => desc(el, name)[0] || null;
const A = (el, name) => (el ? el.getAttribute(name) : null);
const relEmbed = (blip) => A(blip, "r:embed") || A(blip, "embed") || (blip && blip.getAttributeNS && blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed"));

const solidColor = (parent) => {
  const sf = first(parent, "solidFill"); if (!sf) return null;
  const srgb = first(sf, "srgbClr"); if (srgb) return "#" + A(srgb, "val");
  return null;
};

const parseXml = async (zip, path) => {
  const f = zip.file(path); if (!f) return null;
  return new DOMParser().parseFromString(await f.async("string"), "application/xml");
};

const loadRels = async (zip, slidePath) => {
  const dir = slidePath.slice(0, slidePath.lastIndexOf("/"));
  const name = slidePath.slice(slidePath.lastIndexOf("/") + 1);
  const doc = await parseXml(zip, `${dir}/_rels/${name}.rels`);
  const map = {};
  if (doc) Array.from(doc.getElementsByTagName("Relationship")).forEach((r) => { map[r.getAttribute("Id")] = r.getAttribute("Target"); });
  return map;
};

const resolve = (base, target) => {
  // base = ppt/slides/slide1.xml ; target = ../media/image1.png
  const parts = base.split("/"); parts.pop();
  target.split("/").forEach((seg) => { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); });
  return parts.join("/");
};

let _seq = 0;
const uid = () => "el" + Date.now().toString(36) + (_seq++).toString(36);

export async function importPptx(file) {
  const zip = await JSZip.loadAsync(file);
  const pres = await parseXml(zip, "ppt/presentation.xml");
  const sz = pres && firstDesc(pres.documentElement, "sldSz");
  const slideW = (sz && +A(sz, "cx")) || 12192000;
  const slideH = (sz && +A(sz, "cy")) || 6858000;
  const sx = VW / slideW, sy = VH / slideH;
  const pxPerPt = (960 * 12700) / slideW; // pt → our px

  // Slide files in numeric order.
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => (+a.match(/slide(\d+)/)[1]) - (+b.match(/slide(\d+)/)[1]));

  const slides = [];
  for (const path of slidePaths) {
    const doc = await parseXml(zip, path); if (!doc) continue;
    const rels = await loadRels(zip, path);
    const elements = [];

    const getXfrm = (spPr) => {
      const xf = first(spPr, "xfrm"); if (!xf) return null;
      const off = first(xf, "off"), ext = first(xf, "ext"); if (!off || !ext) return null;
      const rot = A(xf, "rot");
      return { x: Math.round((+A(off, "x") || 0) * sx), y: Math.round((+A(off, "y") || 0) * sy),
        w: Math.round((+A(ext, "cx") || 0) * sx), h: Math.round((+A(ext, "cy") || 0) * sy),
        rot: rot ? Math.round(+rot / 60000) : 0 };
    };
    const textOf = (txBody) => kids(txBody, "p").map((p) => kids(p, "r").map((r) => first(r, "t")?.textContent || "").join("")).join("\n");
    const firstRpr = (txBody) => { for (const p of kids(txBody, "p")) for (const r of kids(p, "r")) { const rp = first(r, "rPr"); if (rp) return rp; } return null; };
    const alignOf = (txBody) => { const p = kids(txBody, "p")[0]; const pr = p && first(p, "pPr"); const a = pr && A(pr, "algn"); return { l: "left", ctr: "center", r: "right", just: "left" }[a] || "left"; };

    const tree = doc.getElementsByTagName("p:spTree")[0] || doc.documentElement;
    const walkShapes = (parent) => {
      for (const node of Array.from(parent.children)) {
        const tag = ln(node);
        try {
          if (tag === "sp") {
            const spPr = first(node, "spPr");
            const xf = getXfrm(spPr);
            const txBody = first(node, "txBody");
            const text = txBody ? textOf(txBody).trim() : "";
            if (text) {
              const rp = firstRpr(txBody);
              const szpt = rp && A(rp, "sz") ? +A(rp, "sz") / 100 : 18;
              const faceRaw = rp ? (A(first(rp, "latin") || {}, "typeface") || "") : "";
              const font = FONT_FACES[faceRaw.toLowerCase()] || undefined;
              elements.push({
                id: uid(), type: "text",
                x: xf?.x ?? 60, y: xf?.y ?? 60, width: xf?.w || 400, height: xf?.h || 80,
                text, fontSize: Math.max(8, Math.round(szpt * pxPerPt)),
                color: (rp && solidColor(rp)) || "#1a1714",
                bold: rp && A(rp, "b") === "1" ? true : undefined,
                italic: rp && A(rp, "i") === "1" ? true : undefined,
                align: alignOf(txBody), font, rotation: xf?.rot || undefined,
              });
            } else if (xf) {
              const geom = first(spPr, "prstGeom"); const prst = geom && A(geom, "prst");
              const shape = prst === "ellipse" ? "ellipse" : prst && prst.includes("triangle") ? "triangle" : "rect";
              elements.push({ id: uid(), type: "rect", shape, x: xf.x, y: xf.y, width: xf.w, height: xf.h, fill: solidColor(spPr) || "#cccccc", stroke: solidColor(first(spPr, "ln")) || undefined, rotation: xf.rot || undefined });
            }
          } else if (tag === "pic") {
            const spPr = firstDesc(node, "spPr"); const xf = getXfrm(spPr);
            const blip = firstDesc(node, "blip"); const id = blip && relEmbed(blip); const target = id && rels[id];
            if (xf && target) {
              const p = resolve(path, target); const f = zip.file(p);
              if (f) {
                const ext = p.split(".").pop().toLowerCase();
                const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : "image/jpeg";
                // base64 inline below (async) — push a promise marker, resolved later
                elements.push({ id: uid(), type: "image", x: xf.x, y: xf.y, width: xf.w, height: xf.h, rotation: xf.rot || undefined, _src: { f, mime } });
              }
            }
          } else if (tag === "graphicFrame") {
            const tbl = firstDesc(node, "tbl");
            const xf = getXfrm(node) || getXfrm(first(node, "xfrm"));
            if (tbl && xf) {
              const grid = first(tbl, "tblGrid"); const cols = grid ? kids(grid, "gridCol").length : 0;
              const trs = kids(tbl, "tr");
              const cells = trs.map((tr) => kids(tr, "tc").map((tc) => { const tb = first(tc, "txBody"); return tb ? textOf(tb).trim() : ""; }));
              const rows = trs.length;
              if (rows && cols) elements.push({ id: uid(), type: "table", x: xf.x, y: xf.y, width: xf.w, height: xf.h, rows, cols, cells, headerRow: true, fontSize: 20, color: "#1a1714", borderColor: "#9a9486", headerBg: "#1a1714", headerColor: "#ffffff" });
            }
          } else if (tag === "grpSp") {
            walkShapes(node); // flatten one level (positions approximate)
          }
        } catch { /* skip malformed shape */ }
      }
    };
    walkShapes(tree);

    // Resolve image data URLs.
    for (const el of elements) {
      if (el._src) {
        try { el.src = `data:${el._src.mime};base64,${await el._src.f.async("base64")}`; } catch {}
        delete el._src;
      }
    }

    const bgClr = solidColor(firstDesc(doc.documentElement, "bg")) || undefined;
    slides.push({ id: uid(), background: bgClr, elements: elements.filter((e) => e.type !== "image" || e.src) });
  }

  if (!slides.length) throw new Error("No slides found in this file.");
  return slides;
}
