import { describe, expect, it } from "vitest"
import { resumirTextoPush } from "./texto"

describe("resumirTextoPush", () => {
  it("normaliza espaços sem alterar uma mensagem curta", () => {
    expect(resumirTextoPush("  Aula\n cancelada   hoje. ", 50)).toBe("Aula cancelada hoje.")
  })

  it("resume no limite e preserva palavras quando há espaço para isso", () => {
    const resumo = resumirTextoPush("A matrícula foi aprovada e o acesso está liberado", 30)

    expect(resumo).toBe("A matrícula foi aprovada e o…")
    expect(Array.from(resumo)).toHaveLength(29)
  })

  it("não divide um caractere Unicode ao fazer o corte", () => {
    expect(resumirTextoPush("🥋🥋🥋🥋", 4)).toBe("🥋🥋🥋🥋")
    expect(resumirTextoPush("🥋🥋🥋🥋🥋", 4)).toBe("🥋🥋🥋…")
  })
})
