"use client"

import { CheckCircle2, Download, ExternalLink, Menu, Share2, SquarePlus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type EscolhaInstalacao = {
  outcome: "accepted" | "dismissed"
  platform: string
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<EscolhaInstalacao>
}

type ModoInstalacao = "prompt" | "ios-safari" | "ios-outro" | "manual"

function estaEmModoInstalado() {
  const navegador = navigator as Navigator & { standalone?: boolean }

  return window.matchMedia("(display-mode: standalone)").matches || navegador.standalone === true
}

function ehDispositivoIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
}

function ehSafariNoIOS() {
  return (
    ehDispositivoIOS() &&
    /Safari/i.test(navigator.userAgent) &&
    !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo)/i.test(navigator.userAgent)
  )
}

function obterModoIOS(): ModoInstalacao {
  return ehSafariNoIOS() ? "ios-safari" : "ios-outro"
}

function Passo({
  icone,
  titulo,
  children,
}: {
  icone: React.ReactNode
  titulo: string
  children: React.ReactNode
}) {
  return (
    <li className="grid grid-cols-[2.25rem_1fr] gap-3">
      <span className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
        {icone}
      </span>
      <span className="space-y-1">
        <strong className="block text-sm font-semibold">{titulo}</strong>
        <span className="block text-sm text-muted-foreground">{children}</span>
      </span>
    </li>
  )
}

export function BotaoInstalarApp({
  className,
  rotuloSempreVisivel = false,
}: {
  className?: string
  rotuloSempreVisivel?: boolean
}) {
  const [eventoInstalacao, setEventoInstalacao] = useState<BeforeInstallPromptEvent | null>(null)
  const [modo, setModo] = useState<ModoInstalacao | null>(null)
  const [dialogoAberto, setDialogoAberto] = useState(false)

  const ocultar = useCallback(() => {
    setEventoInstalacao(null)
    setModo(null)
    setDialogoAberto(false)
  }, [])

  useEffect(() => {
    if (estaEmModoInstalado()) {
      ocultar()
      return
    }

    if (ehDispositivoIOS()) {
      setModo(obterModoIOS())
    }

    function aoAntesDeInstalar(evento: Event) {
      evento.preventDefault()
      setEventoInstalacao(evento as BeforeInstallPromptEvent)
      setModo("prompt")
    }

    function aoInstalado() {
      ocultar()
    }

    const modoStandalone = window.matchMedia("(display-mode: standalone)")

    function aoMudarDisplayMode() {
      if (estaEmModoInstalado()) {
        ocultar()
      }
    }

    window.addEventListener("beforeinstallprompt", aoAntesDeInstalar)
    window.addEventListener("appinstalled", aoInstalado)
    modoStandalone.addEventListener("change", aoMudarDisplayMode)

    return () => {
      window.removeEventListener("beforeinstallprompt", aoAntesDeInstalar)
      window.removeEventListener("appinstalled", aoInstalado)
      modoStandalone.removeEventListener("change", aoMudarDisplayMode)
    }
  }, [ocultar])

  async function aoClicar() {
    if (!eventoInstalacao) {
      setDialogoAberto(true)
      return
    }

    const evento = eventoInstalacao
    setEventoInstalacao(null)
    setModo(null)

    try {
      await evento.prompt()
      await evento.userChoice
    } catch {
      setModo(ehDispositivoIOS() ? obterModoIOS() : "manual")
      setDialogoAberto(true)
    }
  }

  if (!modo) return null

  const titulo =
    modo === "prompt"
      ? "Instalar ECVO"
      : modo === "ios-outro"
        ? "Abra no Safari"
        : modo === "manual"
          ? "Instalar ECVO"
          : "Instalar no iPhone"

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={aoClicar}
        aria-label="Instalar app"
        className={cn("shrink-0", className)}
      >
        <Download />
        <span className={rotuloSempreVisivel ? undefined : "hidden sm:inline"}>Instalar app</span>
      </Button>

      <Dialog
        aberto={dialogoAberto}
        aoFechar={() => setDialogoAberto(false)}
        titulo={titulo}
        descricao="Adicione o ECVO à tela inicial para abrir o sistema como aplicativo."
      >
        {modo === "ios-outro" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              No iPhone, a instalação de PWA fica disponível pelo Safari. Abra este mesmo endereço
              no Safari e siga os passos abaixo.
            </p>
            <ol className="space-y-4">
              <Passo icone={<ExternalLink className="size-4" />} titulo="Abra no Safari">
                Use o botão de compartilhar do navegador atual e escolha abrir no Safari.
              </Passo>
              <Passo icone={<Share2 className="size-4" />} titulo="Toque em compartilhar">
                No Safari, toque no ícone de compartilhar na barra inferior.
              </Passo>
              <Passo icone={<SquarePlus className="size-4" />} titulo="Adicione à tela inicial">
                Escolha "Adicionar à Tela de Início" e confirme em "Adicionar".
              </Passo>
            </ol>
          </div>
        ) : modo === "manual" ? (
          <ol className="space-y-4">
            <Passo icone={<Menu className="size-4" />} titulo="Abra o menu do navegador">
              Procure a opção de instalação no menu do navegador ou na barra de endereço.
            </Passo>
            <Passo icone={<Download className="size-4" />} titulo="Escolha instalar">
              Selecione "Instalar app" ou "Adicionar à tela inicial".
            </Passo>
            <Passo icone={<CheckCircle2 className="size-4" />} titulo="Confirme">
              Confirme a instalação para criar o atalho do ECVO.
            </Passo>
          </ol>
        ) : (
          <ol className="space-y-4">
            <Passo icone={<Share2 className="size-4" />} titulo="Toque em compartilhar">
              No Safari, toque no ícone de compartilhar na barra inferior.
            </Passo>
            <Passo icone={<SquarePlus className="size-4" />} titulo="Adicione à tela inicial">
              Escolha "Adicionar à Tela de Início".
            </Passo>
            <Passo icone={<CheckCircle2 className="size-4" />} titulo="Confirme o app">
              Mantenha o nome ECVO e toque em "Adicionar".
            </Passo>
          </ol>
        )}
      </Dialog>
    </>
  )
}
