#!/usr/bin/env node

import { main } from "./root.js";

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
