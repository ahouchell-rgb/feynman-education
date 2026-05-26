import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata = {
  title: "Retrieval — Science Practice",
  description: "Spaced repetition science retrieval practice",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${plex.variable} ${serif.variable}`}>
      <body style={{ margin: 0, padding: 0, fontFamily: "var(--font-plex), -apple-system, sans-serif", background: "#faf7f0", color: "#1c1a14" }}>{children}</body>
    </html>
  );
}
