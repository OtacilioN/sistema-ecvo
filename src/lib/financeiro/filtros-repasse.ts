export function normalizarProfessorFiltro(
  professorId: string | undefined,
  professoresDisponiveis: readonly string[],
) {
  return professorId && professoresDisponiveis.includes(professorId) ? professorId : undefined
}

export function filtrarReceitasPorProfessor<T extends { professorIds: readonly string[] }>(
  receitas: readonly T[],
  professorId: string | undefined,
) {
  return professorId
    ? receitas.filter((receita) => receita.professorIds.includes(professorId))
    : receitas
}
