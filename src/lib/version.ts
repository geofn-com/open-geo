import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

/**
 * Single source of truth for the package version dynamically loaded from package.json
 */
export const VERSION: string = pkg.version ?? "0.1.0";

/**
 * Standard User-Agent for OpenGEO crawlers & audit engines
 */
export const USER_AGENT: string = `open-geo/${VERSION} (+https://github.com/geofn-com/open-geo)`;
