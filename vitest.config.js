import { defineConfig } from "vitest/config";

// jsdom gives the export tests a DOMParser (richToRuns) and document (crop).
// Tests live next to the code as *.test.ts(x).
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
