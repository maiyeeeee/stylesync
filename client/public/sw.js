const CACHE_NAME = "stylesync-emergency-shell-v1"
const SHELL_FILES = ["/", "/index.html"]

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)))
    self.skipWaiting()
})

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
                ),
            ),
    )
    self.clients.claim()
})

self.addEventListener("fetch", (event) => {
    const request = event.request
    const url = new URL(request.url)
    if (request.method !== "GET" || url.origin !== self.location.origin) return
    // Browser fetch/XHR calls have an empty destination. Do not replace a failed
    // API response with index.html; only cache navigation and static app assets.
    if (!request.destination && request.mode !== "navigate") return

    event.respondWith(
        fetch(request)
            .then((response) => {
                const copy = response.clone()
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
                return response
            })
            .catch(() =>
                caches.match(request).then((cached) => cached || caches.match("/index.html")),
            ),
    )
})
