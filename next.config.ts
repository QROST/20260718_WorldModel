import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repository lives below another npm workspace. Pin tracing here so
  // Next.js does not treat the parent lockfile as this app's project root.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
