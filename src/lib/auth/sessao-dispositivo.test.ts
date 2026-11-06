import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Registro = { id: string; usuarioId: string; expiraEm: Date; revogadaEm: Date | null }
type Filtro = {
  id: string
  usuarioId: string
  expiraEm?: { gt: Date; lte: Date; lt: Date }
}

const banco = vi.hoisted(() => ({ registros: new Map<string, Registro>() }))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  db: {
    sessaoDispositivo: {
      create: async ({ data }: { data: Registro }) => {
        banco.registros.set(data.id, { ...data, revogadaEm: null })
      },
      createMany: async ({ data }: { data: Registro[] }) => {
        for (const item of data) {
          if (!banco.registros.has(item.id)) {
            banco.registros.set(item.id, { ...item, revogadaEm: item.revogadaEm ?? null })
          }
        }
      },
      findFirst: async ({ where }: { where: Filtro }) => {
        const registro = banco.registros.get(where.id)
        return registro &&
          registro.usuarioId === where.usuarioId &&
          registro.revogadaEm === null &&
          where.expiraEm &&
          registro.expiraEm > where.expiraEm.gt
          ? { id: registro.id }
          : null
      },
      updateMany: async ({ where, data }: { where: Filtro; data: Partial<Registro> }) => {
        const registro = banco.registros.get(where.id)
        if (
          !registro ||
          registro.usuarioId !== where.usuarioId ||
          registro.revogadaEm !== null ||
          (where.expiraEm &&
            !(
              registro.expiraEm > where.expiraEm.gt &&
              registro.expiraEm <= where.expiraEm.lte &&
              registro.expiraEm < where.expiraEm.lt
            ))
        ) {
          return { count: 0 }
        }
        Object.assign(registro, data)
        return { count: 1 }
      },
    },
  },
}))

import {
  criarSessaoDispositivo,
  revogarSessaoDispositivo,
  revogarSessaoLegada,
} from "@/lib/services/sessao-dispositivo.service"
import { autorizarSessaoDispositivo } from "./sessao-dispositivo"

const DIA_MS = 86_400_000
const aluno = { sub: "usuario-1", nome: "Aluno", papel: "ALUNO" as const, versao: 0 }
const prazoAbsoluto = () => Math.floor((Date.now() + 365 * DIA_MS) / 1000)

beforeEach(() => {
  banco.registros.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"))
})

afterEach(() => vi.useRealTimers())

describe("autorização de sessão por dispositivo", () => {
  it("revoga somente o dispositivo que saiu e não aceita outro titular", async () => {
    const expiraEm = new Date(Date.now() + 30 * DIA_MS)
    const idA = await criarSessaoDispositivo(aluno.sub, expiraEm)
    const idB = await criarSessaoDispositivo(aluno.sub, expiraEm)
    const sessaoA = { ...aluno, sessaoId: idA, exp: prazoAbsoluto() }
    const sessaoB = { ...aluno, sessaoId: idB, exp: prazoAbsoluto() }

    expect(await autorizarSessaoDispositivo(sessaoA)).toBe(true)
    expect(await autorizarSessaoDispositivo({ ...sessaoA, sub: "outro" })).toBe(false)
    await revogarSessaoDispositivo(idA, aluno.sub)
    expect(await autorizarSessaoDispositivo(sessaoA)).toBe(false)
    expect(await autorizarSessaoDispositivo(sessaoB)).toBe(true)
  })

  it("renova atividade antes de expirar, respeita o limite absoluto e não ressuscita sessão expirada", async () => {
    const id = await criarSessaoDispositivo(aluno.sub, new Date(Date.now() + 30 * DIA_MS))
    const limite = Math.floor((Date.now() + 45 * DIA_MS) / 1000)
    const sessao = { ...aluno, sessaoId: id, exp: limite }
    vi.advanceTimersByTime(20 * DIA_MS)
    expect(await autorizarSessaoDispositivo(sessao)).toBe(true)
    expect(banco.registros.get(id)?.expiraEm.getTime()).toBe(limite * 1000)
    vi.advanceTimersByTime(25 * DIA_MS)
    expect(await autorizarSessaoDispositivo(sessao)).toBe(false)
    expect(banco.registros.get(id)?.expiraEm.getTime()).toBe(limite * 1000)
  })

  it("rejeita sessão que ficou 30 dias sem atividade", async () => {
    const id = await criarSessaoDispositivo(aluno.sub, new Date(Date.now() + 30 * DIA_MS))
    const sessao = { ...aluno, sessaoId: id, exp: prazoAbsoluto() }
    vi.advanceTimersByTime(30 * DIA_MS)
    expect(await autorizarSessaoDispositivo(sessao)).toBe(false)
  })

  it("preserva tombstone legado mesmo quando o logout antecede o primeiro acesso", async () => {
    const id = "legado:hash-do-token"
    const exp = Math.floor((Date.now() + 7 * DIA_MS) / 1000)
    const sessao = { ...aluno, sessaoId: id, legada: true, exp }
    await revogarSessaoLegada(id, aluno.sub, new Date(exp * 1000))
    expect(await autorizarSessaoDispositivo(sessao)).toBe(false)
    expect(await autorizarSessaoDispositivo(sessao)).toBe(false)
  })

  it("revoga sessão legada já registrada sem afetar outra sessão", async () => {
    const exp = Math.floor((Date.now() + 7 * DIA_MS) / 1000)
    const sessao = { ...aluno, sessaoId: "legado:outro-token", legada: true, exp }
    const outra = { ...aluno, sessaoId: "legado:terceiro-token", legada: true, exp }
    expect(await autorizarSessaoDispositivo(sessao)).toBe(true)
    expect(await autorizarSessaoDispositivo(outra)).toBe(true)
    await revogarSessaoLegada(sessao.sessaoId, aluno.sub, new Date(exp * 1000))
    expect(await autorizarSessaoDispositivo(sessao)).toBe(false)
    expect(await autorizarSessaoDispositivo(outra)).toBe(true)
  })
})
