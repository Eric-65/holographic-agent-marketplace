import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { apiDevBridgePlugin } from "./vite.apiBridge";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // OPENAI_API_KEY / AI_MODEL are server-only — deliberately NOT prefixed
  // with VITE_, so Vite never exposes them to import.meta.env or the client
  // bundle. loadEnv reads .env locally purely so the /api/ai/* dev bridge
  // (running in this same Node process) can read them via process.env,
  // exactly like the deployed Vercel Edge Functions do.
  const env = loadEnv(mode, process.cwd(), "");
  if (env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  if (env.AI_MODEL) process.env.AI_MODEL = env.AI_MODEL;

  return {
    plugins: [react(), tailwindcss(), viteSingleFile(), apiDevBridgePlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
