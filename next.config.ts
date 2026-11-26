import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Two static pages: the public landing and the local desk. The desk ships
  // inside the plugin and asks the local mozg server for its numbers at run
  // time, so nothing here is rendered per request.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
