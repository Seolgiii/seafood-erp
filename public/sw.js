const CACHE_NAME = 'seaerp-v1';

// 앱 셸: 오프라인에서도 보여줄 최소 리소스
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── 설치: 앱 셸 사전 캐시 ────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── 활성화: 이전 버전 캐시 삭제 ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: 요청 유형별 전략 ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API / 서버 액션 / Airtable → 항상 네트워크 (캐시 금지)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('airtable.com') ||
    url.hostname.includes('vercel-blob.com') ||
    request.method !== 'GET'
  ) {
    return;
  }

  // 페이지 네비게이션 → network-first (오프라인 시 캐시된 루트 반환)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // 성공 응답은 캐시에 저장
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // _next/static, 폰트, 아이콘 등 정적 자산 → cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return res;
      });
    })
  );
});
