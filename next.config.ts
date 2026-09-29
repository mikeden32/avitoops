import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "bcryptjs", "nodemailer", "sharp"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
