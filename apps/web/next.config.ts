import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Phaser ships pre-built UMD; let Next pass it through unbundled for the browser
  webpack(config) {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  }
};
export default config;
