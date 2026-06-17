import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * The package is ESM ("type": "module") so the CLI + core run under Node ESM.
 * Electron's main/preload are simplest as CommonJS (native `__dirname`, no
 * ESM-loader caveats), so we force `.cjs` output for those two while the
 * renderer stays a normal ESM browser bundle. `externalizeDepsPlugin` keeps
 * runtime deps (e.g. yauzl) external rather than bundling them into main.
 */
const cjsOutput = {
  output: { format: "cjs" as const, entryFileNames: "[name].cjs" },
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: cjsOutput },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: cjsOutput },
  },
  renderer: {
    plugins: [react()],
  },
});
