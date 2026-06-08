"use client"

import { upload } from "@vercel/blob/client"
import { Camera, ImagePlus, LoaderCircle, Trash2 } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  contentTypeFotoValido,
  extensaoPorContentType,
  FOTO_DIMENSAO_MAX,
  FOTO_MAX_ORIGINAL_BYTES,
  FOTO_MAX_UPLOAD_BYTES,
  FOTO_QUALIDADE_JPEG,
  type FotoEntidade,
  fotoUrlPorPathname,
} from "@/lib/fotos"
import { cn } from "@/lib/utils"

type Props = {
  id: string
  entidade: FotoEntidade
  registroId?: string | null
  valorInicial?: string | null
  onPendenteChange?: (pendente: boolean) => void
}

export function CampoUploadFoto({
  id,
  entidade,
  registroId,
  valorInicial,
  onPendenteChange,
}: Props) {
  const inputArquivoId = useId()
  const [fotoUrl, setFotoUrl] = useState(valorInicial ?? "")
  const [previewUrl, setPreviewUrl] = useState(valorInicial ?? "")
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, setPendente] = useState(false)
  const [progresso, setProgresso] = useState(0)

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function definirPendente(valor: boolean) {
    setPendente(valor)
    onPendenteChange?.(valor)
  }

  async function aoSelecionarArquivo(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.currentTarget.files?.[0]
    if (!arquivo) return

    setErro(null)
    setProgresso(0)

    if (!arquivo.type.startsWith("image/")) {
      setErro("Selecione uma imagem.")
      return
    }
    if (arquivo.size > FOTO_MAX_ORIGINAL_BYTES) {
      setErro("A foto deve ter no máximo 8 MB.")
      return
    }

    definirPendente(true)

    try {
      const fotoCompactada = await compactarFoto(arquivo)
      if (fotoCompactada.size > FOTO_MAX_UPLOAD_BYTES) {
        throw new Error("A foto compactada ainda ficou maior que 2 MB.")
      }

      const pathname = gerarPathname(fotoCompactada.type)
      const blob = await upload(pathname, fotoCompactada, {
        access: "private",
        contentType: fotoCompactada.type,
        handleUploadUrl: "/api/upload/fotos",
        onUploadProgress: ({ percentage }) => setProgresso(Math.round(percentage)),
      })
      const proximaFotoUrl = fotoUrlPorPathname(blob.pathname)

      setFotoUrl(proximaFotoUrl)
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(fotoCompactada))
    } catch (erroUpload) {
      setErro(erroUpload instanceof Error ? erroUpload.message : "Não foi possível enviar a foto.")
    } finally {
      definirPendente(false)
      event.currentTarget.value = ""
    }
  }

  function removerFoto() {
    setFotoUrl("")
    setErro(null)
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl)
    setPreviewUrl("")
  }

  function gerarPathname(contentType: string) {
    const escopo = registroId || "pendentes"
    const extensao = extensaoPorContentType(contentType)
    return `${entidade}/${escopo}/${crypto.randomUUID()}.${extensao}`
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <input id={id} type="hidden" name="fotoUrl" value={fotoUrl} />
      <Label htmlFor={inputArquivoId}>Foto</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-md border border-border bg-muted bg-cover bg-center text-muted-foreground"
          style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}
        >
          {!previewUrl && <Camera className="size-6" aria-hidden="true" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={inputArquivoId}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
          >
            {pendente ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus aria-hidden="true" />
            )}
            {pendente ? `Enviando ${progresso}%` : "Selecionar foto"}
          </label>
          {fotoUrl && (
            <button
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              type="button"
              onClick={removerFoto}
              disabled={pendente}
            >
              <Trash2 aria-hidden="true" />
              Remover
            </button>
          )}
        </div>
      </div>
      <Input
        id={inputArquivoId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={aoSelecionarArquivo}
        disabled={pendente}
      />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  )
}

async function compactarFoto(arquivo: File) {
  const bitmap = await createImageBitmap(arquivo)
  const escala = Math.min(1, FOTO_DIMENSAO_MAX / Math.max(bitmap.width, bitmap.height))
  const largura = Math.max(1, Math.round(bitmap.width * escala))
  const altura = Math.max(1, Math.round(bitmap.height * escala))

  const canvas = document.createElement("canvas")
  canvas.width = largura
  canvas.height = altura

  const contexto = canvas.getContext("2d")
  if (!contexto) throw new Error("Não foi possível processar a imagem.")
  contexto.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", FOTO_QUALIDADE_JPEG)
  })

  if (!blob) throw new Error("Não foi possível compactar a imagem.")
  const contentType = contentTypeFotoValido(blob.type) ? blob.type : "image/jpeg"

  return new File([blob], nomeCompactado(arquivo.name), {
    type: contentType,
    lastModified: Date.now(),
  })
}

function nomeCompactado(nomeOriginal: string) {
  const base = nomeOriginal.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "-")
  return `${base || "foto"}.jpg`
}
