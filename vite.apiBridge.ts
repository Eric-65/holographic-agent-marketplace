import type { IncomingMessage, ServerResponse } from "http";
import type { Plugin, ViteDevServer } from "vite";

/**
 * Mounts /api/ai/* locally by loading the exact same handler modules Vercel
 * runs in production (api/ai/interpret.ts etc — Web-standard
 * Request/Response signature), so `npm run dev` and the deployed Vercel
 * Edge Functions run identical code. Only intercepts /api/*; everything
 * else falls through to Vite's normal middleware chain.
 */
export function apiDevBridgePlugin(): Plugin {
  return {
    name: "holographic-api-dev-bridge",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url || !req.url.startsWith("/api/")) return next();

        const host = req.headers.host ?? "localhost";
        const url = new URL(req.url, `http://${host}`);
        const relativePath = url.pathname.replace(/^\/api\//, "");
        if (!relativePath || relativePath.includes("..")) return next();

        const modulePath = `/api/${relativePath}.ts`;

        try {
          const mod = await server.ssrLoadModule(modulePath);
          const handler = mod.default as (request: Request) => Promise<Response>;
          if (typeof handler !== "function") {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: `No default export handler in ${modulePath}` }));
            return;
          }

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const bodyBuffer = Buffer.concat(chunks);
          const hasBody = !["GET", "HEAD"].includes((req.method ?? "GET").toUpperCase());

          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers[key] = value;
            else if (Array.isArray(value)) headers[key] = value.join(", ");
          }

          const webRequest = new Request(url, {
            method: req.method ?? "GET",
            headers,
            body: hasBody && bodyBuffer.length > 0 ? bodyBuffer : undefined,
          });

          const webResponse = await handler(webRequest);
          res.statusCode = webResponse.status;
          webResponse.headers.forEach((value, key) => res.setHeader(key, value));
          const text = await webResponse.text();
          res.end(text);
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : "API dev bridge error" }));
        }
      });
    },
  };
}
