import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// jsdom gives the export tests a DOMParser (richToRuns) and document (crop).
// Tests live next to the code as *.test.ts(x).
export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" → "src/*" alias so the lib/server-helper tests resolve.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
