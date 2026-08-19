import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
    ],
    qualities: [60, 75],
  },
  async redirects() {
    return [
      // Ancienne page citernes/débit — /source est devenu /eau.
      { source: "/source", destination: "/eau", permanent: true },
    ];
  },
};

export default nextConfig;
