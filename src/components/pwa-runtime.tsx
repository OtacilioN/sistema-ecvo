"use client"

import { useEffect, useState } from "react"

const CACHE_PREFIX = "ecvo-pwa-"

function limparCacheDePaginas() {
  if (!("caches" in window)) return

  caches
    .keys()
    .then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome.startsWith(CACHE_PREFIX) && nome.endsWith("-pages"))
          .map((nome) => caches.delete(nome)),
      ),
    )
    .catch(() => undefined)
}

export function PwaRuntime() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)

    const atualizarStatus = () => setOnline(navigator.onLine)
    window.addEventListener("online", atualizarStatus)
    window.addEventListener("offline", atualizarStatus)

    if (window.location.pathname === "/login") {
      limparCacheDePaginas()
    }

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined)
    }

    return () => {
      window.removeEventListener("online", atualizarStatus)
      window.removeEventListener("offline", atualizarStatus)
    }
  }, [])

  if (online) return null

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg rounded-md border border-warning/40 bg-card px-4 py-3 text-sm text-card-foreground shadow-lg"
    >
      <strong className="font-semibold">Sem conexão.</strong>{" "}
      <span className="text-muted-foreground">
        Dados já carregados podem continuar disponíveis; alterações dependem da internet.
      </span>
    </div>
  )
}
