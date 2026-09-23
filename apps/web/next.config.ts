import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@cat/shared"],
};

// Reads src/i18n/request.ts (cookie locale, no URL routing).
export default createNextIntlPlugin()(nextConfig);
