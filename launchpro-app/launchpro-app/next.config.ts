import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Copy font files to serverless functions
  outputFileTracingIncludes: {
    '/api/**/*': ['./lib/fonts/**/*'],
  },
  // Mark native packages as external for serverless
  serverExternalPackages: ['sharp', '@resvg/resvg-js'],
};

export default nextConfig;
