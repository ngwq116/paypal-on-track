import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests: real Postgres (database ontrack_test in the Docker container), fake PayPal.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    env: { DATABASE_URL: "postgres://ontrack:ontrack@localhost:5432/ontrack_test" },
    fileParallelism: false, // all files share one database
  },
});
