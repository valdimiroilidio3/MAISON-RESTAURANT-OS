import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The preview runs behind a proxied host; without this Next blocks its own
  // dev assets (/_next/hmr and dynamic chunks) when the Host header differs,
  // which leaves client components stuck on their loading fallback.
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
};

export default nextConfig;
