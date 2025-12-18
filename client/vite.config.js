import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const manifestIcons = [
  {
    src: "sts.png",
    sizes: "192x192",
    type: "image/png",
  },
  {
    src: "sts.png",
    sizes: "512x512",
    type: "image/png",
  },
];

// https://vite.dev/config/
export default defineConfig({
  // server: {
  //   host: '0.0.0.0', // or true
  // },
  plugins: [
    react(),
    VitePWA({
      workbox: {
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB
      },
      registerType: "autoUpdate",
      manifest: {
        name: "STS App",
        short_name: "STS",
        description: "STS App",
        icons: manifestIcons,
      },
    }),
  ],
});
