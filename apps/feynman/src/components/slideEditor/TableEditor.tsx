"use client";
import { useRef, useEffect } from "react";
import type { CSSProperties } from "react";
import { C } from "@/lib/theme";

/* Editable table — each cell is a contentEditable seeded once on mount, so the
   caret survives re-renders. Typing rebuilds the full cells matrix. */
export function TableEditor({ el, onCells }: { el: any; onCells: (cells: string[][]) => void }) {
  const rows = el.rows || 1, cols = el.cols || 1;
  const border = el.borderColor || "#9a9486";
  const headerBg = el.headerBg || "#1a1714", headerColor = el.headerColor || "#ffffff";
  const setCell = (r, c, text) => {
    onCells(Array.from({ length: rows }, (_, rr) => Array.from({ length: cols }, (_, cc) => (rr === r && cc === c ? text : (el.cells?.[rr]?.[cc] ?? "")))));
  };
  return (
    <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontFamily: el.font || C.sans, fontSize: el.fontSize || 22, color: el.color || "#1a1714" }}>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => {
              const head = el.headerRow && r === 0;
              return <Cell key={c} value={el.cells?.[r]?.[c] || ""} onInput={(t) => setCell(r, c, t)}
                style={{ border: `1px solid ${border}`, padding: "4px 9px", verticalAlign: "middle", background: head ? headerBg : "transparent", color: head ? headerColor : (el.color || "#1a1714"), fontWeight: head ? 700 : 400, overflow: "hidden" }} />;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({ value, onInput, style }: { value: string; onInput: (t: string) => void; style: CSSProperties }) {
  const ref = useRef<HTMLTableCellElement>(null);
  useEffect(() => { if (ref.current) ref.current.textContent = value || ""; }, []); // seed once
  return <td ref={ref} contentEditable suppressContentEditableWarning
    onMouseDown={(e) => e.stopPropagation()}
    onInput={() => onInput(ref.current?.textContent ?? "")}
    style={{ ...style, outline: "none", cursor: "text" }} />;
}
