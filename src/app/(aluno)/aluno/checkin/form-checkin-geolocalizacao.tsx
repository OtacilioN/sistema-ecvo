"use client"

import { Loader2, MapPin, ShieldAlert } from "lucide-react"
import { useActionState, useRef, useState } from "react"
import { acaoCheckinAlunoGeolocalizacao, type EstadoTreino } from "@/app/actions/treino"
import { Button } from "@/components/ui/button"

export function FormCheckinGeolocalizacao({ aulaId }: { aulaId: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const latitudeRef = useRef<HTMLInputElement>(null)
  const longitudeRef = useRef<HTMLInputElement>(null)
  const [estado, acao, pendente] = useActionState<EstadoTreino, FormData>(
    acaoCheckinAlunoGeolocalizacao,
    undefined,
  )
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false)
  const [erroLocalizacao, setErroLocalizacao] = useState<string | null>(null)

  function solicitarLocalizacao() {
    if (!window.isSecureContext) {
      setErroLocalizacao("Use uma conexão segura (HTTPS) para compartilhar a localização.")
      return
    }
    if (!navigator.geolocation) {
      setErroLocalizacao("Este navegador não permite usar a localização para o check-in.")
      return
    }

    setBuscandoLocalizacao(true)
    setErroLocalizacao(null)
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        if (!latitudeRef.current || !longitudeRef.current) return
        latitudeRef.current.value = String(posicao.coords.latitude)
        longitudeRef.current.value = String(posicao.coords.longitude)
        setBuscandoLocalizacao(false)
        formRef.current?.requestSubmit()
      },
      (erro) => {
        setBuscandoLocalizacao(false)
        setErroLocalizacao(mensagemErroGeolocalizacao(erro))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    )
  }

  return (
    <form ref={formRef} action={acao} className="space-y-3">
      <input type="hidden" name="aulaId" value={aulaId} />
      <input ref={latitudeRef} type="hidden" name="latitude" />
      <input ref={longitudeRef} type="hidden" name="longitude" />
      <Button
        type="button"
        className="w-full"
        disabled={buscandoLocalizacao || pendente}
        onClick={solicitarLocalizacao}
      >
        {buscandoLocalizacao || pendente ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <MapPin className="size-4" />
        )}
        {buscandoLocalizacao
          ? "Obtendo localização..."
          : pendente
            ? "Confirmando..."
            : "Usar localização"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Permita a localização do celular. O check-in é liberado a até 300 m da academia; sua
        localização não é armazenada.
      </p>
      {(erroLocalizacao || estado?.erro) && (
        <p
          className={
            estado?.inadimplente
              ? "rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
              : "rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          }
        >
          {estado?.inadimplente && <ShieldAlert className="mr-2 inline size-4" />}
          {erroLocalizacao ?? estado?.erro}
        </p>
      )}
    </form>
  )
}

function mensagemErroGeolocalizacao(erro: GeolocationPositionError): string {
  if (erro.code === erro.PERMISSION_DENIED) {
    return "Permita o acesso à localização para fazer check-in por geolocalização."
  }
  if (erro.code === erro.TIMEOUT) {
    return "A localização demorou demais. Tente novamente em um local com melhor sinal."
  }
  return "Não foi possível obter sua localização. Tente novamente."
}
