import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

// Seed de demonstração da ECVO. Cria configuração, gestor, professor, alunos,
// modalidades + graduações, plano e uma turma recorrente com aulas para os próximos dias.
// Senha padrão de todos os usuários de exemplo: "ecvo123".

const db = new PrismaClient()
const hash = (senha: string) => bcrypt.hashSync(senha, 10)
const SENHA_PADRAO = hash("ecvo123")
const GRADUACOES_KICKBOXING = [
  "Branca",
  "Amarela",
  "Laranja",
  "Verde",
  "Azul",
  "Marrom",
  "Preta",
] as const
const GRADUACOES_KICKBOXING_LEGADAS = [
  ["Iniciante", "Branca"],
  ["Intermediário", "Amarela"],
  ["Avançado", "Laranja"],
] as const

async function main() {
  // Configuração singleton
  await db.configuracaoAcademia.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  })

  // ─── Modalidades + graduações ───
  const jiu = await db.modalidade.upsert({
    where: { nome: "Jiu-jitsu" },
    update: {},
    create: {
      nome: "Jiu-jitsu",
      duracaoPadraoMin: 90,
      descricao: "Arte suave — solo e no-gi.",
      graduacoes: {
        create: [
          { nome: "Faixa Branca", ordem: 1 },
          { nome: "Faixa Azul", ordem: 2, minHoras: 200 },
          { nome: "Faixa Roxa", ordem: 3, minHoras: 500 },
          { nome: "Faixa Marrom", ordem: 4, minHoras: 1000 },
          { nome: "Faixa Preta", ordem: 5, minHoras: 2500 },
        ],
      },
    },
  })

  const kick = await db.modalidade.upsert({
    where: { nome: "Kickboxing" },
    update: {},
    create: {
      nome: "Kickboxing",
      duracaoPadraoMin: 60,
      graduacoes: {
        create: GRADUACOES_KICKBOXING.map((nome, index) => ({ nome, ordem: index + 1 })),
      },
    },
  })

  await db.$transaction(async (tx) => {
    for (const [legado, atual] of GRADUACOES_KICKBOXING_LEGADAS) {
      const existente = await tx.graduacao.findUnique({
        where: { modalidadeId_nome: { modalidadeId: kick.id, nome: atual } },
        select: { id: true },
      })
      if (existente) continue

      await tx.graduacao.updateMany({
        where: { modalidadeId: kick.id, nome: legado },
        data: { nome: atual, minHoras: null },
      })
    }

    for (const [index, nome] of GRADUACOES_KICKBOXING.entries()) {
      await tx.graduacao.upsert({
        where: { modalidadeId_nome: { modalidadeId: kick.id, nome } },
        update: { ordem: index + 1, minHoras: null },
        create: { modalidadeId: kick.id, nome, ordem: index + 1 },
      })
    }

    await tx.graduacao.deleteMany({
      where: {
        modalidadeId: kick.id,
        nome: { notIn: [...GRADUACOES_KICKBOXING] },
        historico: { none: {} },
        historicoAnterior: { none: {} },
        resultadosExame: { none: {} },
      },
    })
  })

  await db.modalidade.upsert({
    where: { nome: "Muay Thai" },
    update: {},
    create: { nome: "Muay Thai", duracaoPadraoMin: 60 },
  })
  await db.modalidade.upsert({
    where: { nome: "Boxe" },
    update: {},
    create: { nome: "Boxe", duracaoPadraoMin: 60 },
  })

  // ─── Gestor ───
  await db.usuario.upsert({
    where: { email: "gestor@ecvo.com.br" },
    update: {},
    create: {
      email: "gestor@ecvo.com.br",
      senhaHash: SENHA_PADRAO,
      nome: "Gestor ECVO",
      papel: "GESTOR",
    },
  })

  // ─── Professor ───
  const profUser = await db.usuario.upsert({
    where: { email: "professor@ecvo.com.br" },
    update: {},
    create: {
      email: "professor@ecvo.com.br",
      senhaHash: SENHA_PADRAO,
      nome: "Professor Silva",
      papel: "PROFESSOR",
      professor: {
        create: {
          telefone: "(11) 90000-0001",
          modalidades: { connect: [{ id: jiu.id }, { id: kick.id }] },
        },
      },
    },
    include: { professor: true },
  })
  const professorId = profUser.professor!.id

  // ─── Plano ───
  const plano = await db.plano.upsert({
    where: { id: "plano-mensal-demo" },
    update: {},
    create: {
      id: "plano-mensal-demo",
      nome: "Mensal Ilimitado",
      valor: 199.9,
      periodicidade: "MENSAL",
      diaVencimento: 10,
      modalidades: { connect: [{ id: jiu.id }, { id: kick.id }] },
    },
  })

  // ─── Alunos ───
  await db.usuario.upsert({
    where: { email: "aluno@ecvo.com.br" },
    update: {},
    create: {
      email: "aluno@ecvo.com.br",
      senhaHash: SENHA_PADRAO,
      nome: "Ana Mensalista",
      papel: "ALUNO",
      aluno: {
        create: {
          tipo: "MENSALISTA",
          status: "ATIVO",
          cpf: "39053344705",
          telefone: "(11) 91111-1111",
          dataInicio: new Date(),
          planoId: plano.id,
          modalidades: { connect: [{ id: jiu.id }] },
        },
      },
    },
  })

  await db.usuario.upsert({
    where: { email: "wellhub@ecvo.com.br" },
    update: {},
    create: {
      email: "wellhub@ecvo.com.br",
      senhaHash: SENHA_PADRAO,
      nome: "Bruno Wellhub",
      papel: "ALUNO",
      aluno: {
        create: {
          tipo: "WELLHUB",
          status: "ATIVO",
          idExterno: "WH-0001",
          modalidades: { connect: [{ id: kick.id }] },
        },
      },
    },
  })

  // ─── Turma recorrente (Jiu-jitsu, segunda-feira 19:00–20:30) + aulas dos próximos 14 dias ───
  const turma = await db.turma.upsert({
    where: { id: "turma-jiu-seg-demo" },
    update: {},
    create: {
      id: "turma-jiu-seg-demo",
      nome: "Jiu-jitsu — Segunda 19h",
      modalidadeId: jiu.id,
      professorId,
      diaSemana: 1,
      diasSemana: [1],
      horaInicio: "19:00",
      horaFim: "20:30",
      duracaoMin: 90,
      capacidade: 20,
      local: "Tatame 1",
      nivel: "Todos os níveis",
    },
  })

  const hoje = new Date()
  for (let i = 0; i < 14; i++) {
    const dia = new Date(hoje)
    dia.setDate(hoje.getDate() + i)
    if (dia.getDay() !== 1) continue // só segundas
    const inicio = new Date(dia)
    inicio.setHours(19, 0, 0, 0)
    const fim = new Date(dia)
    fim.setHours(20, 30, 0, 0)
    await db.aula.upsert({
      where: { turmaId_inicio: { turmaId: turma.id, inicio } },
      update: {},
      create: { turmaId: turma.id, professorId, inicio, fim, duracaoMin: 90 },
    })
  }

  console.log(
    "✓ Seed concluído. Usuários: gestor@ecvo.com.br / professor@ecvo.com.br / aluno@ecvo.com.br / wellhub@ecvo.com.br (senha: ecvo123)",
  )
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
