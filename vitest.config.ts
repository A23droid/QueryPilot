import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    reporters: process.env.CI ? ["verbose", "junit"] : ["verbose"],
    outputFile: {
      junit: "test-results/junit.xml",
    },
  },
});
