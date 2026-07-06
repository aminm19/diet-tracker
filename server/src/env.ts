import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load the repo-root `.env` explicitly. In production (Render), env vars are
// set on the platform dashboard and this file won't exist, so this is a no-op.
const rootEnvPath = resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}
