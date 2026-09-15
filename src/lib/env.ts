import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads environment variables prioritizing the user's current working directory .env,
 * then falling back to package root .env without overriding system or user variables.
 */
export function loadEnv(): void {
  // 1. Try loading from current working directory (.env) where user executes the CLI
  const cwdEnvPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(cwdEnvPath)) {
    dotenv.config({ path: cwdEnvPath, override: false });
  }

  // 2. Try loading from package root .env as fallback without overriding user or system env
  const rootEnvPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(rootEnvPath) && rootEnvPath !== cwdEnvPath) {
    dotenv.config({ path: rootEnvPath, override: false });
  }

  // 3. Fallback default dotenv config
  dotenv.config();
}

// Auto-run on import
loadEnv();
