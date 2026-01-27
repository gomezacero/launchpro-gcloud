import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Requerido para Cloud Run - genera build standalone optimizado
  output: 'standalone',

  // Copy font files to serverless functions
  outputFileTracingIncludes: {
    '/api/**/*': ['./lib/fonts/**/*'],
  },

  // Mark native packages as external for serverless
  // @google-cloud/* packages have JSON config files that don't bundle correctly
  serverExternalPackages: [
    'sharp',
    '@resvg/resvg-js',
    '@google-cloud/tasks',
    '@google-cloud/aiplatform',
    '@google-cloud/storage',
  ],

  // Configuración para mejor performance en Cloud Run
  // Nota: Para instrumentación, crear app/instrumentation.ts directamente
  // (Next.js 14+ habilita instrumentation automáticamente si existe el archivo)
};

export default nextConfig;
