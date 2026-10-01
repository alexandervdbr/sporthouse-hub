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
    // that at 10MB by default. Raised to match our own upload size checks
    // (MAX_UPLOAD_BYTES in lib/upload-policy). Note this only lifts Next's
    // own ceiling: Vercel still rejects any single request body over 4.5 MB,
    // which is why large uploads go through the chunked path.
    proxyClientMaxBodySize: '2gb',
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
