"use client"

import { BellOff, BellRing } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

type EstadoPush = "checando" | "indisponivel" | "desativado" | "ativo" | "bloqueado"

type StatusPush = {
  configurado: boolean
  publicKey: string | null
}

type PushNotificacoesControleProps = {
  className?: string
  mostrarTextoSempre?: boolean
  aoMudarEstado?: (estado: EstadoPush) => void
}

function suportaPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

function chaveAplicacao(publicKey: string) {
  const padding = "=".repeat((4 - (publicKey.length % 4)) % 4)
  const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)

  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }

  return output
}

async function obterRegistroServiceWorker() {
  const existente = await navigator.serviceWorker.getRegistration("/")
  if (existente) return existente
  return navigator.serviceWorker.register("/sw.js")
}

async function obterStatusPush(): Promise<StatusPush | null> {
  const response = await fetch("/api/notificacoes/push", { cache: "no-store" })
  if (!response.ok) return null
  return response.json()
}

export function PushNotificacoesControle({
  className,
  mostrarTextoSempre = false,
  aoMudarEstado,
}: PushNotificacoesControleProps = {}) {
  const [estado, setEstado] = useState<EstadoPush>("checando")
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [pendente, setPendente] = useState(false)

  const sincronizar = useCallback(async () => {
    if (!suportaPush()) {
      setEstado("indisponivel")
      return
    }

    if (Notification.permission === "denied") {
      setEstado("bloqueado")
      return
    }

    const status = await obterStatusPush()
    if (!status?.configurado || !status.publicKey) {
      setEstado("indisponivel")
      return
    }

    setPublicKey(status.publicKey)
    const registro = await navigator.serviceWorker.getRegistration("/")
    const inscricao = await registro?.pushManager.getSubscription()
    setEstado(inscricao ? "ativo" : "desativado")
  }, [])

  useEffect(() => {
    sincronizar().catch(() => setEstado("indisponivel"))
  }, [sincronizar])

  useEffect(() => {
    aoMudarEstado?.(estado)
  }, [aoMudarEstado, estado])

  async function ativar() {
    if (!publicKey || pendente) return
    setPendente(true)

    try {
      const permissao = await Notification.requestPermission()
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desativado")
        return
      }

      const registro = await obterRegistroServiceWorker()
      const existente = await registro.pushManager.getSubscription()
      const inscricao =
        existente ??
        (await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: chaveAplicacao(publicKey),
        }))

      const response = await fetch("/api/notificacoes/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inscricao),
      })

      if (!response.ok) throw new Error("Falha ao salvar inscrição push.")
      setEstado("ativo")
    } catch {
      setEstado("desativado")
    } finally {
      setPendente(false)
    }
  }

  async function desativar() {
    if (pendente) return
    setPendente(true)

    try {
      const registro = await navigator.serviceWorker.getRegistration("/")
      const inscricao = await registro?.pushManager.getSubscription()
      if (inscricao) {
        await fetch("/api/notificacoes/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        })
        await inscricao.unsubscribe()
      }
      setEstado("desativado")
    } catch {
      setEstado("ativo")
    } finally {
      setPendente(false)
    }
  }

  if (estado === "checando" || estado === "indisponivel") return null

  if (estado === "bloqueado") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        title="Notificações bloqueadas"
        className={className}
      >
        <BellOff />
        <span className={mostrarTextoSempre ? undefined : "hidden sm:inline"}>Push bloqueado</span>
      </Button>
    )
  }

  const ativo = estado === "ativo"

  return (
    <Button
      type="button"
      variant={ativo ? "secondary" : "outline"}
      size="sm"
      onClick={ativo ? desativar : ativar}
      disabled={pendente}
      aria-pressed={ativo}
      aria-label={ativo ? "Desativar push" : "Ativar push"}
      title={ativo ? "Desativar push" : "Ativar push"}
      className={className}
    >
      {ativo ? <BellRing /> : <BellOff />}
      <span className={mostrarTextoSempre ? undefined : "hidden sm:inline"}>
        {pendente ? "Aguarde..." : ativo ? "Push ativo" : "Ativar push"}
      </span>
    </Button>
  )
}
