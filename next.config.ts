import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // A self-contained server bundle, so the OCI container only needs node.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // The dev server is opened from more than one host name (localhost, 127.0.0.1,
  // and the LAN address on a phone). Next 16 blocks cross-origin /_next/* dev
  // resources unless the origin is listed, which breaks hydration.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.1.199"],
  // The floating dev badge overlaps the phone bottom navigation; the terminal
  // already reports compile errors.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
