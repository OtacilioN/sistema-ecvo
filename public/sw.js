const VERSAO = "ecvo-pwa-v1"
const CACHE_APP = `${VERSAO}-app`
const CACHE_PAGINAS = `${VERSAO}-pages`
const CACHE_ESTATICOS = `${VERSAO}-static`
const CACHES_ATUAIS = new Set([CACHE_APP, CACHE_PAGINAS, CACHE_ESTATICOS])

const ARQUIVOS_APP = [
  "/offline",
  "/manifest.webmanifest",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/maskable-192.png",
  "/pwa/maskable-512.png",
  "/apple-touch-icon.png",
  "/logo.jpeg",
]

function mesmaOrigem(url) {
  return url.origin === self.location.origin
}

function ehArquivoEstatico(url, request) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pwa/") ||
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font" ||
    request.destination === "image"
  )
}

function podeSalvar(response) {
  return response?.ok && response.type === "basic"
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_APP)
      .then((cache) => cache.addAll(ARQUIVOS_APP))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((nome) => nome.startsWith("ecvo-pwa-") && !CACHES_ATUAIS.has(nome))
            .map((nome) => caches.delete(nome)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event

  if (
    request.method !== "GET" ||
    (request.cache === "only-if-cached" && request.mode !== "same-origin")
  ) {
    return
  }

  const url = new URL(request.url)
  if (!mesmaOrigem(url)) return

  if (ehArquivoEstatico(url, request)) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPagina(request))
  }
})

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_ESTATICOS)
  const salvo = await cache.match(request)
  if (salvo) return salvo

  const response = await fetch(request)
  if (podeSalvar(response)) {
    cache.put(request, response.clone())
  }

  return response
}

async function networkFirstPagina(request) {
  const cache = await caches.open(CACHE_PAGINAS)

  try {
    const response = await fetch(request)
    if (podeSalvar(response)) {
      cache.put(request, response.clone())
    }
    return response
  } catch (_erro) {
    const paginaSalva = await cache.match(request)
    if (paginaSalva) return paginaSalva

    const fallback = await caches.match("/offline")
    if (fallback) return fallback

    return new Response("Sem conexão.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
}
