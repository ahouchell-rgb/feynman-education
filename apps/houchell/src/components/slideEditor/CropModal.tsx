"use client";
import { useState } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";

interface CropModalProps {
  el: any;
  onApply: (box: any, natW: number, natH: number) => void;
  onCancel: () => void;
}

/* Crop modal: drag the box to move, drag the corner to resize. Stores the crop
   as 0–1 fractions of the source image. */
export function CropModal({ el, onApply, onCancel }: CropModalProps) {
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState(el.crop || { x: 0, y: 0, w: 1, h: 1 });

  const onLoad = (e) => {
    const im = e.target;
    const r = Math.min(680 / im.naturalWidth, 440 / im.naturalHeight, 1);
    setNat({ w: im.naturalWidth, h: im.naturalHeight });
    setDisp({ w: Math.round(im.naturalWidth * r), h: Math.round(im.naturalHeight * r) });
  };

  const startMove = (e) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, ox = box.x, oy = box.y, bw = box.w, bh = box.h;
    const move = (ev) => {
      const nx = Math.max(0, Math.min(ox + (ev.clientX - sx) / disp.w, 1 - bw));
      const ny = Math.max(0, Math.min(oy + (ev.clientY - sy) / disp.h, 1 - bh));
      setBox((b) => ({ ...b, x: nx, y: ny }));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const startResize = (e) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, ow = box.w, oh = box.h, bx = box.x, by = box.y;
    const move = (ev) => {
      const nw = Math.max(0.05, Math.min(ow + (ev.clientX - sx) / disp.w, 1 - bx));
      const nh = Math.max(0.05, Math.min(oh + (ev.clientY - sy) / disp.h, 1 - by));
      setBox((b) => ({ ...b, w: nw, h: nh }));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  return (
    <div onMouseDown={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 18 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.dim, marginBottom: 10 }}>Crop image</div>
        <div style={{ position: "relative", width: disp.w || 320, height: disp.h || 200, userSelect: "none" }}>
          <img src={el.src} alt="" draggable={false} onLoad={onLoad}
            style={{ width: disp.w || "auto", height: disp.h || "auto", maxWidth: 680, maxHeight: 440, display: "block" }} />
          {disp.w > 0 && (
            <div onMouseDown={startMove}
              style={{ position: "absolute", cursor: "move", boxSizing: "border-box",
                       left: box.x * disp.w, top: box.y * disp.h, width: box.w * disp.w, height: box.h * disp.h,
                       border: `2px solid ${C.accent}`, boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}>
              <div onMouseDown={startResize}
                style={{ position: "absolute", right: -7, bottom: -7, width: 14, height: 14, background: "#fff", border: `2px solid ${C.accent}`, borderRadius: 2, cursor: "nwse-resize" }} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <Btn v="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn onClick={() => onApply(box, nat.w, nat.h)}>Apply crop</Btn>
        </div>
      </div>
    </div>
  );
}
