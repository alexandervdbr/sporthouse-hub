/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 removed the `eslint` build-config key and the `next lint`
  // command entirely — ESLint no longer runs as part of `next build`
  // regardless of any flag here, so lint enforcement now lives in the
  // `prebuild` npm script instead (see package.json).
  typescript: { ignoreBuildErrors: false },
  serverExternalPackages: ['pdf-parse', '@anthropic-ai/sdk', 'ffmpeg-static'],
  experimental: {
    // Global middleware (src/middleware.ts) buffers the request body for
    // every route it runs on, including upload API routes — Next.js caps
    // that at 10MB by default. Raised to match our own upload size checks.
    proxyClientMaxBodySize: '500mb',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cyhburjidtoudltqabfo.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
