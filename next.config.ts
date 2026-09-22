import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core", "@browserbasehq/sdk", "@onkernel/sdk"],
  outputFileTracingIncludes: {
    "/api/admin/thumbs": ["./node_modules/playwright-core/browsers.json"],
    "/api/cron/media-health": ["./node_modules/playwright-core/browsers.json"],
  },
};

export default nextConfig;
