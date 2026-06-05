import { fileURLToPath } from "node:url"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    globals: true,
    // `server-only` lança erro fora de um Server Component; nos testes de unidade
    // (lógica de domínio pura) substituímos por um módulo vazio.
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
})
