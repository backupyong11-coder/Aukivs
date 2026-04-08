import type { NextConfig } from "next";

const backendTarget =
  (process.env.OPSPROXY_TARGET || "http://127.0.0.1:8001").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/ops/:path*",
        destination: `${backendTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
