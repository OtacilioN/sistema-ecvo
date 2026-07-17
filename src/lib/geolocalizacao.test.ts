import { describe, expect, it } from "vitest"
import {
  coordenadasGeograficasValidas,
  distanciaEmMetros,
  estaProximoDaAcademia,
  LOCALIZACAO_ACADEMIA,
  RAIO_CHECKIN_GEOLOCALIZACAO_METROS,
} from "./geolocalizacao"

describe("geolocalização do check-in", () => {
  it("aceita a localização da academia e o limite de 300 metros", () => {
    const latitudeNoLimite =
      LOCALIZACAO_ACADEMIA.latitude + RAIO_CHECKIN_GEOLOCALIZACAO_METROS / 111_195

    expect(
      estaProximoDaAcademia(LOCALIZACAO_ACADEMIA.latitude, LOCALIZACAO_ACADEMIA.longitude),
    ).toBe(true)
    expect(estaProximoDaAcademia(latitudeNoLimite, LOCALIZACAO_ACADEMIA.longitude)).toBe(true)
  })

  it("bloqueia uma localização acima do limite", () => {
    const latitudeForaDoLimite = LOCALIZACAO_ACADEMIA.latitude + 301 / 111_195

    expect(estaProximoDaAcademia(latitudeForaDoLimite, LOCALIZACAO_ACADEMIA.longitude)).toBe(false)
    expect(
      distanciaEmMetros(
        { latitude: latitudeForaDoLimite, longitude: LOCALIZACAO_ACADEMIA.longitude },
        LOCALIZACAO_ACADEMIA,
      ),
    ).toBeGreaterThan(RAIO_CHECKIN_GEOLOCALIZACAO_METROS)
  })

  it("rejeita coordenadas inválidas", () => {
    expect(coordenadasGeograficasValidas(91, 0)).toBe(false)
    expect(coordenadasGeograficasValidas(0, Number.NaN)).toBe(false)
  })
})
