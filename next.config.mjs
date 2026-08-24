/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
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
