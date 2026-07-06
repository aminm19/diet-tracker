import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// The server package's cwd during `pnpm --filter server db:*` is `server/`,
// but `.env` lives at the repo root — load it explicitly rather than relying
// on cwd-relative auto-loading.
const currentDir = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(currentDir, "../.env");
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Run `neon link` or check your .env file.");
}

export default defineConfig({
  schema: "../shared/src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
