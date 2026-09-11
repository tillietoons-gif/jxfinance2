import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: no `output: "standalone"` — that is self-hosting/container config.
  // Vercel uses its own output pipeline; standalone broke the old `cp`-based build script.
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    allowedHosts: [".monkeycode-ai.live"],
  },
};

export default nextConfig;
