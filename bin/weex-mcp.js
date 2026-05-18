#!/usr/bin/env node
import { main } from "../src/index.js";

main().catch((err) => {
  // stdout is reserved for the MCP stdio transport — log errors to stderr.
  console.error("[weex-trading-mcp] fatal:", err);
  process.exit(1);
});
