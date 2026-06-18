import { FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DECLARACOES_TERMO_RESPONSABILIDADE,
  menorDeIdade,
  TERMO_RESPONSABILIDADE_CIDADE,
  TERMO_RESPONSABILIDADE_VERSAO,
} from "@/lib/termo-responsabilidade"
import { formatarData } from "@/lib/utils/datas"
import { FormTermoResponsabilidade } from "./form-termo-responsabilidade"

type Props = {
  aluno: {
    cpf: string | null
    dataNascimento: Date | null
    usuario: { dataNascimento: Date | null; nome: string }
  }
}

export function TermoResponsabilidadeAluno({ aluno }: Props) {
  const ehMenor = menorDeIdade(aluno.dataNascimento ?? aluno.usuario.dataNascimento)
  const hoje = new Date()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <FileText className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Termo de responsabilidade</h1>
          <p className="text-sm text-muted-foreground">
            O agendamento e o check-in ficam liberados após todos os aceites obrigatórios.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Versão {TERMO_RESPONSABILIDADE_VERSAO}</Badge>
            {ehMenor && <Badge variant="warning">Menor de 18 anos</Badge>}
          </div>
          <CardTitle>TERMO DE RESPONSABILIDADE</CardTitle>
          <CardDescription>
            Eu, {aluno.usuario.nome}, portador do CPF {aluno.cpf ?? "não informado"}, declaro que
            estou ciente dos riscos inerentes à prática de atividades físicas esportivas na Escola
            de Combate Vinicius de Oliveira.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">Declaro ainda que:</p>
            <ul className="space-y-2">
              {DECLARACOES_TERMO_RESPONSABILIDADE.slice(0, -1).map((declaracao) => (
                <li key={declaracao.id} className="grid grid-cols-[auto_1fr] gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{declaracao.texto}</span>
                </li>
              ))}
            </ul>
            <p>{DECLARACOES_TERMO_RESPONSABILIDADE.at(-1)?.texto}</p>
            <p>
              Local e Data: {TERMO_RESPONSABILIDADE_CIDADE}, {formatarData(hoje)}.
            </p>
            <div className="space-y-1 text-foreground">
              <p>Assinatura do Aluno: assinatura digital pelo acesso autenticado.</p>
              <p>
                Assinatura do Responsável (se menor de 18 anos): aceite digital específico quando
                aplicável.
              </p>
              <p className="pt-2">
                Marcus Vinicius de Oliveira Ferreira
                <br />
                Faixa Preta RG2495
              </p>
            </div>
          </div>

          <FormTermoResponsabilidade menorDeIdade={ehMenor} />
        </CardContent>
      </Card>
    </div>
  )
}
