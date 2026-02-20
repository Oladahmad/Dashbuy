import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force tracing root to this repo to avoid multi-lockfile root inference issues on CI/Vercel.
  outputFileTracingRoot: path.resolve(process.cwd()),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;
