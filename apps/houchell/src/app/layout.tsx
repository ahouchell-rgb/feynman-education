import "./globals.css";
import { AuthProvider } from "@/lib/sk";

export const metadata = {
  title: "Houchell Education",
  description: "A shared curriculum workspace for every subject",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a href="#main" className="sk-skip-link">Skip to content</a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
