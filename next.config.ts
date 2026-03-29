import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: Vercel auto-detects Next.js — do NOT set output: "standalone"
  // as it breaks Vercel's native Next.js deployment integration

  // Allow polygon.io images
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.polygon.io" },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },

  // Redirect bare /api calls to home
  async redirects() {
    return [];
  },
};

export default nextConfig;
