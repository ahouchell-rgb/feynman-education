"use client";
import type { ReactNode } from "react";
import { C } from "@/lib/theme";

// Thin vertical divider used to group toolbar clusters.
export const Sep = () => <span style={{ width: 1, height: 22, alignSelf: "center", background: C.border, margin: "0 2px" }} />;

// Small uppercase section label for the right inspector panel.
export const PanelLabel = ({ children }: { children?: ReactNode }) => (
  <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim }}>{children}</div>
);
