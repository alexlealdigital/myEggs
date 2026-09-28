/* myEggs — service worker
   Troque VERSION a cada deploy que mudar arquivos (o subir-github.bat faz isso sozinho). */
const VERSION = "myeggs-20260928-091316";
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./game.js",
  "./manifest.webmanifest",
  "./assets/sprites/ovo.png",
  "./assets/sprites/alvo.png",
  "./assets/sprites/alvo_acertado.png",
  "./assets/lizards-games.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/favicon-64.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Página, JS e CSS: rede primeiro (atualiza na hora), cache se estiver offline.
async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") return cache.match("./index.html");
    throw err;
  }
}

// Imagens e fontes: cache primeiro e atualiza em segundo plano.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; })
    .catch(() => hit);
  return hit || net;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fontes do Google
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }
  // Qualquer outra origem (API no Render) passa direto, sem cache
  if (url.origin !== self.location.origin) return;

  if (req.destination === "image") e.respondWith(staleWhileRevalidate(req));
  else e.respondWith(networkFirst(req));
});
