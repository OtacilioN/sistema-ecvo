"use client"

import type { IScannerControls } from "@zxing/browser"
import { Camera, Loader2, QrCode, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

type StatusLeitor = "parado" | "abrindo" | "lendo" | "encontrado"

export function LeitorQRCodeAluno() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const [status, setStatus] = useState<StatusLeitor>("parado")
  const [erro, setErro] = useState<string | null>(null)

  useEffect(
    () => () => {
      controlsRef.current?.stop()
      controlsRef.current = null
    },
    [],
  )

  const pararLeitura = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setStatus("parado")
  }, [])

  const irParaTokenLido = useCallback(
    (valor: string) => {
      const token = extrairTokenCheckin(valor)

      if (!token) {
        setStatus("parado")
        setErro("Este QR Code não é um check-in válido da ECVO.")
        return
      }

      setErro(null)
      setStatus("encontrado")
      router.push(`/aluno/checkin?token=${encodeURIComponent(token)}`)
    },
    [router],
  )

  useEffect(() => {
    if (status !== "abrindo") return

    let cancelado = false

    async function prepararLeitura() {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser")
        const leitor = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 })
        const video = videoRef.current

        if (!video) {
          setStatus("parado")
          setErro("Não foi possível preparar a câmera.")
          return
        }

        const controls = await leitor.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          },
          video,
          (resultado, error, controles) => {
            if (resultado) {
              controles.stop()
              controlsRef.current = null
              irParaTokenLido(resultado.getText())
              return
            }

            if (error && error.name !== "NotFoundException") {
              setErro("Não foi possível ler o QR Code. Ajuste a câmera e tente novamente.")
            }
          },
        )

        if (cancelado) {
          controls.stop()
          return
        }

        controlsRef.current = controls
        setStatus("lendo")
      } catch (error) {
        setStatus("parado")
        setErro(mensagemErroCamera(error))
      }
    }

    prepararLeitura()

    return () => {
      cancelado = true
    }
  }, [irParaTokenLido, status])

  function iniciarLeitura() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErro("Este navegador não liberou acesso à câmera pelo site.")
      return
    }

    setErro(null)
    setStatus("abrindo")
  }

  const lendo = status === "abrindo" || status === "lendo" || status === "encontrado"

  return (
    <section className="rounded-md border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <QrCode className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">Ler QR Code</h2>
            <p className="text-sm text-muted-foreground">
              Abra a câmera pelo site para liberar as aulas disponíveis para check-in.
            </p>
          </div>
        </div>

        {lendo ? (
          <Button type="button" variant="outline" onClick={pararLeitura} className="sm:w-auto">
            <X className="size-4" />
            Fechar câmera
          </Button>
        ) : (
          <Button type="button" onClick={iniciarLeitura} className="sm:w-auto">
            <Camera className="size-4" />
            Abrir câmera
          </Button>
        )}
      </div>

      {lendo && (
        <div className="mt-4 overflow-hidden rounded-md border bg-black">
          <div className="relative aspect-video">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
              aria-label="Leitor de QR Code"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-40 rounded-lg border-2 border-primary shadow-[0_0_0_999px_rgb(0_0_0/0.35)]" />
            </div>
            {status === "abrindo" && (
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/70 px-3 py-2 text-sm text-white">
                <Loader2 className="size-4 animate-spin" />
                Abrindo câmera...
              </div>
            )}
          </div>
        </div>
      )}

      {erro && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {erro}
        </p>
      )}
    </section>
  )
}

function extrairTokenCheckin(valor: string): string | null {
  const texto = valor.trim()
  if (!texto) return null

  try {
    const url = new URL(texto, window.location.origin)
    const token = url.searchParams.get("token")

    if (token && url.pathname === "/aluno/checkin") return token
  } catch {
    // QR Codes antigos ou testes manuais podem conter somente o token.
  }

  return /^[A-Za-z0-9_-]{16,}$/.test(texto) ? texto : null
}

function mensagemErroCamera(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Permita o acesso à câmera para ler o QR Code."
    }
    if (error.name === "NotFoundError") {
      return "Nenhuma câmera foi encontrada neste dispositivo."
    }
  }

  return "Não foi possível abrir a câmera neste navegador."
}
