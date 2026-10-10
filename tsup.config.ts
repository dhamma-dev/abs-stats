import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['server/index.ts'],
  outDir: 'dist/server',
  format: 'esm',
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  // keep "node:sqlite" as-is - it only exists under the node: prefix
  removeNodeProtocol: false,
})
