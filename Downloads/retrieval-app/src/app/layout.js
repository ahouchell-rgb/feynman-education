import { IBM_Plex_Sans } from "next/font/google";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata = {
  title: "Retrieval — Science Practice",
  description: "Spaced repetition science retrieval practice",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={plex.variable}>
      <body style={{ margin: 0, padding: 0, fontFamily: "var(--font-plex), -apple-system, sans-serif", background: "#F2EBDA", color: "#101314" }}>{children}</body>
    </html>
  );
}
