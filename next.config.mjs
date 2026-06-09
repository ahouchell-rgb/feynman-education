/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer, webpack }) => {
    // pptxgenjs (used client-side for .pptx export) references Node-only
    // modules behind `node:` imports. Strip the scheme and stub the modules
    // so the browser bundle builds.
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (r) => {
          r.request = r.request.replace(/^node:/, "");
        })
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, https: false, http: false, os: false, path: false,
        "image-size": false, express: false,
      };
    }
    return config;
  },
};
export default nextConfig;
