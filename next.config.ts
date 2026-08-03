import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp and pg-boss are node-only; keep them out of the bundler.
  serverExternalPackages: ["sharp", "pg-boss", "postgres"],
};

export default nextConfig;
