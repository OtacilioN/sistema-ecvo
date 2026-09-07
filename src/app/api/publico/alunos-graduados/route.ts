import { listarAlunosGraduadosPublicos } from "@/lib/services/alunos-graduados-publicos.service"

const CABECALHOS_PUBLICOS = {
  "access-control-allow-headers": "Content-Type",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
}

export async function GET(request: Request) {
  try {
    const alunos = await listarAlunosGraduadosPublicos(new URL(request.url).origin)

    return Response.json({ total: alunos.length, alunos }, { headers: CABECALHOS_PUBLICOS })
  } catch (erro) {
    console.error("Não foi possível listar os alunos graduados na API pública.", erro)
    return Response.json(
      { erro: "Não foi possível carregar os alunos graduados." },
      { status: 500, headers: CABECALHOS_PUBLICOS },
    )
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CABECALHOS_PUBLICOS })
}
