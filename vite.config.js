import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// The build is one self-contained index.html: CSS, JS, data, icons and flags inlined.
// It works from any folder on any host, or opened straight from disk.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
});
