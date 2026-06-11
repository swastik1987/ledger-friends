import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "logo-512.png"],
      manifest: {
        name: "ExpenseSync",
        short_name: "ExpenseSync",
        description:
          "Track expenses together, effortlessly. AI-powered bank statement parsing, shared trackers, and spending insights.",
        theme_color: "#F6F1E7",
        background_color: "#F6F1E7",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell + static assets are precached; xlsx/pdf chunks load on demand
        // so cap is raised to cover the larger split chunks.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            // Google Fonts stylesheets + font files
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Bank logo favicons
            urlPattern: /^https:\/\/www\.google\.com\/s2\/favicons.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "bank-favicons",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Paths the SPA must never swallow: /~oauth/* is Lovable's OAuth
        // broker (Google/Apple sign-in) served by the host, not React Router.
        // Without this, the installed PWA's SW serves index.html for the
        // broker navigation and the user lands on the app's 404 page.
        navigateFallbackDenylist: [/^\/api/, /^\/~oauth/],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
