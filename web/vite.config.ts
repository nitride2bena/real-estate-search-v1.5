import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          if (normalized.includes("/node_modules/xlsx/")) {
            return "xlsx";
          }
          if (normalized.includes("/node_modules/maplibre-gl/")) {
            return "maplibre-gl";
          }
          if (
            normalized.includes("/node_modules/react/") ||
            normalized.includes("/node_modules/react-dom/") ||
            normalized.includes("/node_modules/scheduler/")
          ) {
            return "react-vendor";
          }
          if (
            normalized.includes("/node_modules/zustand/") ||
            normalized.includes("/node_modules/topojson-client/")
          ) {
            return "state-geo-vendor";
          }
        },
      },
    },
  },
});
