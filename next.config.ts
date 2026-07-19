// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

import type { NextConfig } from "next";
import {
  QROST_PROVENANCE_HEADER,
  QROST_PROVENANCE_VALUE,
} from "./lib/qrost-provenance";

const nextConfig: NextConfig = {
  // This repository lives below another npm workspace. Pin tracing here so
  // Next.js does not treat the parent lockfile as this app's project root.
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: QROST_PROVENANCE_HEADER,
            value: QROST_PROVENANCE_VALUE,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
