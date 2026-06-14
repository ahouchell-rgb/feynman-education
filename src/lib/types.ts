/* ─── Shared domain types ───
 * The slide deck is a JSON array of slides on a fixed 960×540 canvas. These
 * mirror the schema the slides-assistant route (src/app/api/slides-assistant)
 * sends to and receives from Claude, and what SlideEditor / SlideStage render.
 *
 * SlideElement is deliberately a single broad interface (a `type` discriminant
 * plus optional fields) rather than a strict discriminated union: the editor
 * and renderer read fields positionally across many element kinds, and a union
 * would force narrowing at hundreds of call sites for little safety gain. Treat
 * the per-type field groups below as documentation of which fields each kind uses. */

export type ElementType =
  | "text"
  | "rect"
  | "arrow"
  | "image"
  | "table"
  | "timer"
  | "video"
  | "visualiser"
  | "retrieval"
  | "html"
  | "equation"
  | "chart";

export type ChartType = "bar" | "line" | "pie";
export type TextAlign = "left" | "center" | "right";

export interface ChartSeries {
  name?: string;
  color?: string;
  values?: number[];
}

export interface SlideElement {
  id: string;
  type: ElementType;

  /* geometry (most elements) */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  reveal?: boolean;

  /* text */
  text?: string;
  rich?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: TextAlign;
  bg?: string;
  font?: string;
  fontFace?: string;

  /* rect */
  fill?: string;
  stroke?: string;
  radius?: number;

  /* arrow */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  thickness?: number;

  /* image / video / embeds */
  src?: string;

  /* table */
  rows?: number;
  cols?: number;
  cells?: string[][];
  headerRow?: boolean;
  headerBg?: string;
  headerColor?: string;
  borderColor?: string;

  /* timer */
  duration?: number;

  /* html template */
  html?: string;
  title?: string;

  /* equation */
  latex?: string;

  /* chart */
  chartType?: ChartType;
  showLegend?: boolean;
  labels?: string[];
  series?: ChartSeries[];

  /* escape hatch for fields not modelled above */
  [key: string]: unknown;
}

export interface Slide {
  id: string;
  background?: string;
  notes?: string;
  elements: SlideElement[];
}

export type Deck = Slide[];
