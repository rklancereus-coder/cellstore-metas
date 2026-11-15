/* App de Metas instalável: páginas e arquivos vêm da rede primeiro (sempre a versão nova);
   sem internet, usa a última cópia guardada. versao.json nunca vai para o cache.
   Avisos no celular (push): mostra a notificação e, ao tocar, abre o app na tela certa. */
const CACHE = "metas-202611151700";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith("versao.json")) return;
  e.respondWith((async () => {
    try { const r = await fetch(req); if (r.ok) (await caches.open(CACHE)).put(req, r.clone()); return r; }
    catch (er) { const c = await caches.match(req, { ignoreSearch: true }); if (c) return c; throw er; }
  })());
});
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (er) { d = { corpo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Metas Cell Store", {
    body: d.corpo || "Tem novidade nas metas.", icon: "icone-192.png", badge: "favicon.png",
    tag: d.tag || "metas", renotify: true, data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const alvo = new URL(e.notification.data && e.notification.data.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abertas) if (c.url.startsWith(self.registration.scope)) { await c.navigate(alvo).catch(() => { }); await c.focus(); return; }
    await self.clients.openWindow(alvo);
  })());
});
