import type { NextConfig } from "next";

/**
 * allowedDevOrigins: the sandbox/preview environment serves the dev overlay,
 * HMR and other dev-only resources from a proxied host (e.g. *.e2b.app) while
 * the server itself listens on localhost. Without this Next 16 blocks those
 * cross-origin dev resources in `next dev`, the page renders but never
 * hydrates — buttons and dialogs appear dead in preview even though the same
 * build behaves correctly in production. Harmless in `next build`.
 */
const nextConfig: NextConfig = {
  images: { qualities: [75, 90] },
  allowedDevOrigins: ["127.0.0.1", "*.e2b.app"],
};

export default nextConfig;
