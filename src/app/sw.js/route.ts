/**
 * The service worker, hand-written (no dependency). It makes the app open without a
 * connection: app pages are fetched from the network first and the last copy is kept
 * for when there is none; Next.js build files are cached for good (their names change
 * with every build); anything else goes straight to the network. Logging offline is
 * handled by the page (src/lib/offline), not here.
 *
 * Pages hold the person's own data, so the copies are dropped when they sign out, and
 * admin pages are never kept.
 */

const source = (version: string) => `// Tuffo service worker ${version}
const PAGES = "tuffo-pages";
const STATIC = "tuffo-static";
const OFFLINE = "/offline";
const MAX_STATIC = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC);
      const keys = await cache.keys();
      // Oldest first: drop build files from long-gone deploys.
      for (const request of keys.slice(0, Math.max(0, keys.length - MAX_STATIC))) await cache.delete(request);
      await self.clients.claim();
    })(),
  );
});

function pageKey(url) {
  return url.origin + url.pathname;
}

async function networkFirst(request, url) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    const html = (response.headers.get("content-type") || "").includes("text/html");
    if (response.ok && response.type === "basic" && !response.redirected && html) {
      await cache.put(pageKey(url), response.clone());
    }
    return response;
  } catch (error) {
    const copy = await cache.match(pageKey(url));
    if (copy) return copy;
    const offline = await caches.match(OFFLINE);
    return offline || new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Signing out, or landing on the sign-in page, forgets the kept pages.
  if ((request.method === "POST" && url.pathname === "/auth/signout") || (request.mode === "navigate" && url.pathname === "/login")) {
    event.waitUntil(caches.delete(PAGES));
    return;
  }
  if (request.method !== "GET") return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  const page = request.mode === "navigate" || request.headers.get("x-tuffo-warm") === "1";
  if (page && url.pathname.startsWith("/app") && !url.pathname.startsWith("/app/admin") && !url.searchParams.has("_rsc")) {
    event.respondWith(networkFirst(request, url));
  }
});
`;

export function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  return new Response(source(version), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
