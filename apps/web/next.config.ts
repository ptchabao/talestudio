import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Single .env at the monorepo root, shared by web, worker and db tooling.
// Real environment variables (prod) always win: loadEnvFile never overrides what is already set.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  transpilePackages: ["@talestudio/ui", "@talestudio/core", "@talestudio/db", "@talestudio/storage", "@talestudio/pipeline", "@talestudio/ai", "@talestudio/blocks"],
  // Native / Node-heavy deps stay external to the server bundle.
  serverExternalPackages: ["@temporalio/client", "@temporalio/core-bridge", "postgres"],
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }, { protocol: "http", hostname: "localhost" }] },
  poweredByHeader: false,
  // Lets CI build next to a running dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default config;
