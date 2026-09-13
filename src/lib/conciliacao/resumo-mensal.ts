type RegistroResumo = {
  id: string
  alunoId: string | null
  nome: string | null
  idExterno: string | null
  cpf?: string | null
  valorRepasse: { toString(): string } | number | string | null
  totalCheckins: number | null
  statusConciliacao: string
  aluno: { usuario: { nome: string } } | null
  importacao: {
    plataforma: "WELLHUB" | "TOTALPASS"
    competencia: string | null
    unidadeExternaId: string | null
    unidadeExternaNome: string | null
    arquivo: string
  }
}

export function consolidarResumoMensal(registros: RegistroResumo[]) {
  const grupos = new Map<
    string,
    {
      chave: string
      competencia: string | null
      plataforma: "WELLHUB" | "TOTALPASS"
      alunoId: string | null
      nome: string
      idsExternos: Set<string>
      documentos: Set<string>
      receitaCentavos: number
      totalCheckins: number
      checkinsInformados: boolean
      contas: Map<string, { nome: string; receitaCentavos: number }>
      registros: { id: string; status: string; conta: string; alunoId: string | null }[]
    }
  >()
  for (const registro of registros) {
    const identidade =
      registro.importacao.plataforma === "TOTALPASS" && registro.cpf
        ? `cpf:${registro.cpf}`
        : registro.idExterno
          ? `externo:${registro.idExterno}`
          : registro.alunoId
            ? `aluno:${registro.alunoId}`
            : `registro:${registro.id}`
    const chave = `${registro.importacao.plataforma}:${registro.importacao.competencia}:${identidade}`
    let grupo = grupos.get(chave)
    if (!grupo) {
      grupo = {
        chave,
        competencia: registro.importacao.competencia,
        plataforma: registro.importacao.plataforma,
        alunoId: registro.alunoId,
        nome: registro.aluno?.usuario.nome ?? registro.nome ?? "Aluno não identificado",
        idsExternos: new Set(),
        documentos: new Set(),
        receitaCentavos: 0,
        totalCheckins: 0,
        checkinsInformados: false,
        contas: new Map(),
        registros: [],
      }
      grupos.set(chave, grupo)
    }
    if (registro.alunoId && registro.aluno) {
      grupo.alunoId = registro.alunoId
      grupo.nome = registro.aluno.usuario.nome
    }
    const receitaCentavos = Math.round(Number(registro.valorRepasse ?? 0) * 100)
    const chaveConta = registro.importacao.unidadeExternaId ?? registro.importacao.arquivo
    const nomeConta =
      registro.importacao.unidadeExternaNome ??
      registro.importacao.unidadeExternaId ??
      registro.importacao.arquivo
    const conta = grupo.contas.get(chaveConta) ?? { nome: nomeConta, receitaCentavos: 0 }
    conta.receitaCentavos += receitaCentavos
    grupo.contas.set(chaveConta, conta)
    grupo.receitaCentavos += receitaCentavos
    grupo.totalCheckins += registro.totalCheckins ?? 0
    if (registro.totalCheckins !== null) grupo.checkinsInformados = true
    if (registro.cpf) grupo.documentos.add(registro.cpf)
    if (registro.idExterno) grupo.idsExternos.add(registro.idExterno)
    grupo.registros.push({
      id: registro.id,
      status: registro.statusConciliacao,
      conta: nomeConta,
      alunoId: registro.alunoId,
    })
  }
  return [...grupos.values()].sort(
    (a, b) =>
      (b.competencia ?? "").localeCompare(a.competencia ?? "") ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  )
}
