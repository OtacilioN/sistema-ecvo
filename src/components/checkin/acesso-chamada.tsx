"use client"

import { Loader2, MapPin } from "lucide-react"
import Link from "next/link"
import { useActionState, useState, useTransition } from "react"
import { confirmarLocalizacaoChamada, liberarChamada } from "@/app/actions/chamada-rapida"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AcessoChamada({ chave }: { chave: string }) {
  const [localizacaoConfirmada, setLocalizacaoConfirmada] = useState(false)
  const [erroLocalizacao, setErroLocalizacao] = useState("")
  const [localizando, setLocalizando] = useState(false)
  const [confirmando, iniciarConfirmacao] = useTransition()
  const ocupado = localizando || confirmando

  function confirmarLocalizacao() {
    setErroLocalizacao("")
    if (!navigator.geolocation) {
      setErroLocalizacao(
        "Este navegador não oferece localização. Abra o link no navegador do celular.",
      )
      return
    }
    setLocalizando(true)
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setLocalizando(false)
        iniciarConfirmacao(async () => {
          try {
            const resultado = await confirmarLocalizacaoChamada(chave, {
              latitude: posicao.coords.latitude,
              longitude: posicao.coords.longitude,
              precisao: posicao.coords.accuracy,
              capturadaEm: posicao.timestamp,
            })
            if (resultado.erro) setErroLocalizacao(resultado.erro)
            if (resultado.localizacaoConfirmada) {
              setLocalizacaoConfirmada(true)
            }
          } catch {
            setErroLocalizacao(
              "Não foi possível confirmar a localização. Verifique sua conexão e tente novamente.",
            )
          }
        })
      },
      (erro) => {
        setLocalizando(false)
        setErroLocalizacao(
          erro.code === 1
            ? "Permita o acesso à localização nas configurações do navegador e tente novamente."
            : "Não foi possível obter uma localização precisa. Ative o GPS e tente novamente.",
        )
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    )
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6 rounded-md border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <h1 className="text-2xl font-black">Professor, faça a chamada da aula</h1>
        <p className="text-sm text-muted-foreground">
          Confira os alunos presentes em poucos passos, sem precisar lembrar sua senha.
        </p>
      </div>
      <ol className="space-y-2 text-sm">
        <li>1. QR Code da academia verificado.</li>
        <li>
          2.{" "}
          {localizacaoConfirmada
            ? "Localização confirmada."
            : "Confirme que você está na academia (até 200 m)."}
        </li>
        <li>3. Informe a contra-senha fornecida pela academia.</li>
      </ol>
      {localizacaoConfirmada ? (
        <FormContraSenha chave={chave} confirmarNovamente={() => setLocalizacaoConfirmada(false)} />
      ) : (
        <Button className="min-h-12 w-full" onClick={confirmarLocalizacao} disabled={ocupado}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          {ocupado ? "Verificando localização…" : "Confirmar minha localização"}
        </Button>
      )}
      {erroLocalizacao && (
        <p role="alert" className="text-sm text-destructive">
          {erroLocalizacao}
        </p>
      )}
      <Link href="/login" className="block text-center text-sm underline">
        Entrar com minha conta
      </Link>
    </div>
  )
}

function FormContraSenha({
  chave,
  confirmarNovamente,
}: {
  chave: string
  confirmarNovamente: () => void
}) {
  const [estado, action, enviando] = useActionState(liberarChamada, {})
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="acesso" value={chave} />
      <label htmlFor="contrasenha" className="block text-sm font-semibold">
        Contra-senha
      </label>
      <Input
        id="contrasenha"
        name="contrasenha"
        type="password"
        required
        autoComplete="off"
        maxLength={64}
      />
      {estado.localizacaoConfirmada === false ? (
        <Button type="button" className="min-h-12 w-full" onClick={confirmarNovamente}>
          Confirmar localização novamente
        </Button>
      ) : (
        <Button type="submit" className="min-h-12 w-full" disabled={enviando}>
          {enviando && <Loader2 className="size-4 animate-spin" />} Ver chamada da aula
        </Button>
      )}
      {estado.erro && (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      )}
    </form>
  )
}
