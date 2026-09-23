/*
 * LegalHigh service worker（S4-T1 只读离线壳，2026-09）。
 * 策略（与 v6 计划决策 21-A 一致：只读离线，写操作/在线 API 不缓存）：
 *  - 导航请求（SPA 路由）：网络优先，失败回落缓存的 index.html（离线仍可浏览已缓存外壳）。
 *  - /api/：仅网络——离线时展示页面自身的诚实降级态（骨架/错误横幅），绝不缓存编造。
 *  - 静态资产（带哈希的 js/css/字体/图片）：缓存优先。
 *  - /data/laws.json 等公开数据：先回缓存再后台更新（stale-while-revalidate）。
 * 缓存以版本号命名（CACHE 常量），activate 时清理旧版本——语料更新后 SW 字节变化即触发全量刷新。
 */
const CACHE = 'lh-shell-v2';
const PRECACHE = ['/data/laws.json', '/data/xrefs.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // 仅网络：离线走页面诚实降级态

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || Response.error())),
    );
    return;
  }

  const isStatic = /\.(?:js|css|woff2?|png|svg|jpe?g|webp|ico)$/.test(url.pathname) || url.pathname.startsWith('/assets/');
  const isPublicData = url.pathname.startsWith('/data/') || url.pathname === '/llms.txt' || url.pathname === '/llms-full.txt';

  if (isStatic) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  if (isPublicData) {
    // stale-while-revalidate：离线立即回旧数据，在线后台刷新
    event.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req)
          .then((res) => {
            c.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || net;
      }),
    );
  }
});
