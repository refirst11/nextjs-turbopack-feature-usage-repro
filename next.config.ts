import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Both arms must build from a cold graph, so persistent and in-memory
    // caching are disabled. These default to enabled in the 16.3 line.
    turbopackFileSystemCacheForBuild: false,
    turbopackMemoryEviction: false,
  },
};

export default nextConfig;
