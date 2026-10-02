import { gzipSync } from "node:zlib";

// `next start` no comprime las respuestas de las APIs (solo páginas y archivos estáticos): las
// capas GeoJSON se comprimen acá, una sola vez por contenido.
const gzipCache = new Map<string, { source: string; body: Uint8Array<ArrayBuffer> }>();

export function geoJsonResponse(request: Request, key: string, json: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/geo+json; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    Vary: "Accept-Encoding",
  };

  if (!/\bgzip\b/.test(request.headers.get("accept-encoding") ?? "")) {
    return new Response(json, { headers });
  }

  let cached = gzipCache.get(key);
  if (cached?.source !== json) {
    cached = { source: json, body: new Uint8Array(gzipSync(json)) };
    gzipCache.set(key, cached);
  }

  return new Response(cached.body, { headers: { ...headers, "Content-Encoding": "gzip" } });
}
