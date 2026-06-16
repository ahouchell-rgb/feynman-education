/** @type {import('next').NextConfig} */

// Origins allowed to EMBED this app in an <iframe> — the ScienceKit lesson page
// embeds retrieval practice. Space-separated origin list.
// Defaults to the confirmed ScienceKit origins (Vercel project "science-kit");
// override with ALLOWED_FRAME_ANCESTORS for other hosts. The wildcard covers
// ScienceKit preview deployments — tighten to specific origins if you want it
// stricter.
const frameAncestors = `'self' ${process.env.ALLOWED_FRAME_ANCESTORS || "https://science-kit.vercel.app https://*.vercel.app http://localhost:3000"}`.trim();

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Controls who may frame this app. We deliberately do NOT set
          // X-Frame-Options, which would block embedding outright.
          { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors};` },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
