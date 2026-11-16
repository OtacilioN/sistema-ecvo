export type MesEvolucaoReceita = {
  competencia: string
  diasNoMes: number
  recebidoPorDia: number[]
}

export type DadosEvolucaoReceita = {
  competenciaAtual: string
  diaAtual: number
  primeiraCompetenciaComRecebimento: string | null
  meses: MesEvolucaoReceita[]
  previsaoPorDia: number[]
  quantidadeMensalidadesPrevistas: number
}

export type OpcoesComparativoReceita = {
  agrupamento: "dia" | "semana"
  janela: 3 | 6
  medida: "media" | "mediana"
}

export type PontoComparativoReceita = {
  dia: number
  rotulo: string
  atual: number | null
  anterior: number
  historico: number
  projetado: number | null
}

function acumuladoCentavos(mes: MesEvolucaoReceita | undefined, dia: number): number {
  return (mes?.recebidoPorDia.slice(0, dia) ?? []).reduce(
    (total, valor) => total + Math.round(valor * 100),
    0,
  )
}

function referenciaCentavos(valores: number[], medida: OpcoesComparativoReceita["medida"]) {
  if (valores.length === 0) return 0
  if (medida === "media") {
    return Math.round(valores.reduce((total, valor) => total + valor, 0) / valores.length)
  }
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2
    ? ordenados[meio]
    : Math.round((ordenados[meio - 1] + ordenados[meio]) / 2)
}

/** Compara recebimentos acumulados no mesmo dia do mês, em centavos. */
export function construirComparativoReceita(
  dados: DadosEvolucaoReceita,
  opcoes: OpcoesComparativoReceita,
) {
  const indiceAtual = dados.meses.findIndex((mes) => mes.competencia === dados.competenciaAtual)
  const atual = dados.meses[indiceAtual]
  const diasNoMesAtual = atual?.diasNoMes ?? dados.previsaoPorDia.length
  const anterior = dados.meses[indiceAtual - 1]
  const historico = dados.meses
    .slice(Math.max(0, indiceAtual - opcoes.janela), indiceAtual)
    .filter(
      (mes) =>
        dados.primeiraCompetenciaComRecebimento !== null &&
        mes.competencia >= dados.primeiraCompetenciaComRecebimento,
    )
  const temMesAnterior = Boolean(
    anterior &&
      dados.primeiraCompetenciaComRecebimento &&
      anterior.competencia >= dados.primeiraCompetenciaComRecebimento,
  )
  const ultimoDia = Math.max(
    atual?.diasNoMes ?? 0,
    anterior?.diasNoMes ?? 0,
    ...historico.map((mes) => mes.diasNoMes),
  )
  const dias = Array.from({ length: ultimoDia }, (_, indice) => indice + 1).filter(
    (dia) =>
      opcoes.agrupamento === "dia" ||
      dia % 7 === 0 ||
      dia === ultimoDia ||
      dia === diasNoMesAtual ||
      dia === dados.diaAtual,
  )
  const valoresNoDia = (dia: number) => ({
    atual: acumuladoCentavos(atual, dia) / 100,
    anterior: acumuladoCentavos(anterior, dia) / 100,
    historico:
      referenciaCentavos(
        historico.map((mes) => acumuladoCentavos(mes, dia)),
        opcoes.medida,
      ) / 100,
  })
  const recebidoAtualCentavos = acumuladoCentavos(atual, dados.diaAtual)
  const previstoAteDiaCentavos = (dia: number) =>
    dados.previsaoPorDia
      .slice(dados.diaAtual - 1, Math.min(dia, diasNoMesAtual))
      .reduce((total, valor) => total + Math.round(valor * 100), 0)
  const aReceberCentavos = previstoAteDiaCentavos(diasNoMesAtual)

  const pontos: PontoComparativoReceita[] = dias.map((dia) => {
    const parcial = dia === dados.diaAtual && dia % 7 !== 0 && dia !== diasNoMesAtual
    const inicioSemana = Math.floor((dia - 1) / 7) * 7 + 1
    return {
      dia,
      rotulo:
        opcoes.agrupamento === "dia"
          ? `Dia ${dia}`
          : `${inicioSemana}–${dia}${parcial ? " (parcial)" : ""}`,
      ...valoresNoDia(dia),
      atual: dia <= dados.diaAtual ? valoresNoDia(dia).atual : null,
      projetado:
        dia >= dados.diaAtual && dia <= diasNoMesAtual
          ? (recebidoAtualCentavos + previstoAteDiaCentavos(dia)) / 100
          : null,
    }
  })

  return {
    pontos,
    resumo: valoresNoDia(dados.diaAtual),
    mesesHistorico: historico.length,
    temMesAnterior,
    projecao: {
      total: (recebidoAtualCentavos + aReceberCentavos) / 100,
      aReceber: aReceberCentavos / 100,
      quantidadeMensalidades: dados.quantidadeMensalidadesPrevistas,
      diasNoMes: diasNoMesAtual,
    },
  }
}
