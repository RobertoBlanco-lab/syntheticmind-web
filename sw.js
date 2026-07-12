// SyntheticMind Web — service worker.
// Cachea la app y los corpus para que funcione offline una vez cargada
// ("modo avión" también en la web). El modelo LLM lo cachea WebLLM por su
// cuenta (Cache API propia), aquí no se duplica.
const CACHE = "sm-web-v2";
const SHELL = [
  "./", "./index.html", "./chat.html", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png",
  "./datos_legal.json", "./datos_jcyl.json", "./datos_asturias.json", "./datos_madrid.json",
  "./wasm/synthetic_mind_wasm.js", "./wasm/synthetic_mind_wasm_bg.wasm",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Uno a uno: si falta un fichero (p. ej. wasm sin compilar) no rompe el resto.
    await Promise.allSettled(SHELL.map(u => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Mismo origen + CDN del runtime WebLLM. Los shards del modelo (huggingface)
  // NO se tocan: los gestiona WebLLM en su propia caché.
  const cacheable = url.origin === location.origin
    || url.hostname.endsWith("esm.run")
    || url.hostname.endsWith("jsdelivr.net");
  if (!cacheable) return;
  // Páginas HTML: red primero (para que las actualizaciones lleguen),
  // caché solo como respaldo offline. Resto: caché primero.
  const esPagina = e.request.mode === "navigate" || e.request.destination === "document";
  e.respondWith((async () => {
    const hit = await caches.match(e.request);
    if (hit && !esPagina) return hit;
    try {
      const r = await fetch(e.request);
      if (r && (r.ok || r.type === "opaque")) {
        const c = await caches.open(CACHE);
        c.put(e.request, r.clone());
      }
      return r;
    } catch (err) {
      return hit || Response.error();
    }
  })());
});
