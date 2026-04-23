import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    config.module.rules.push({
      test: /\.(otf|ttf)$/i,
      type: "asset/inline",
      generator: {
        dataUrl: (content: Buffer) =>
          `data:font/otf;base64,${content.toString("base64")}`,
      },
    });
    return config;
  },
};

export default nextConfig;