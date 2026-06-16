/** @type {import('next').NextConfig} */

// Origins allowed to EMBED this app in an <iframe> — the ScienceKit lesson page
// embeds retrieval practice. Space-separated origin list.
// FILL: set ALLOWED_FRAME_ANCESTORS to your ScienceKit origins, e.g.
//   "https://sciencekit.vercel.app https://*.vercel.app http://localhost:3000"
// Defaults to 'self' only (embedding disabled) so it fails closed until set.
const frameAncestors = `'self' ${process.env.ALLOWED_FRAME_ANCESTORS || ""}`.trim();

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
