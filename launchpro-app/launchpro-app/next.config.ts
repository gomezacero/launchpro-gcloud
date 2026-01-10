import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Copy font files to serverless functions
  experimental: {
    outputFileTracingIncludes: {
      '/api/**/*': ['./lib/fonts/**/*'],
    },
  },
  // Increase serverless function timeout for image generation
  serverExternalPackages: ['sharp', '@resvg/resvg-js'],
};

export default nextConfig;
