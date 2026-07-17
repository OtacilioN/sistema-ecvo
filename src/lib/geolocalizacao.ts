export const LOCALIZACAO_ACADEMIA = {
  latitude: -7.2061939,
  longitude: -34.8450226,
} as const

export const RAIO_CHECKIN_GEOLOCALIZACAO_METROS = 300

const RAIO_TERRA_EM_METROS = 6_371_000

export function coordenadasGeograficasValidas(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

/** Calcula a distância em linha reta entre duas coordenadas geográficas (fórmula de Haversine). */
export function distanciaEmMetros(
  origem: { latitude: number; longitude: number },
  destino: { latitude: number; longitude: number },
): number {
  const paraRadianos = (graus: number) => (graus * Math.PI) / 180
  const deltaLatitude = paraRadianos(destino.latitude - origem.latitude)
  const deltaLongitude = paraRadianos(destino.longitude - origem.longitude)
  const latitudeOrigem = paraRadianos(origem.latitude)
  const latitudeDestino = paraRadianos(destino.latitude)
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeOrigem) * Math.cos(latitudeDestino) * Math.sin(deltaLongitude / 2) ** 2

  return 2 * RAIO_TERRA_EM_METROS * Math.asin(Math.sqrt(haversine))
}

export function estaProximoDaAcademia(latitude: number, longitude: number): boolean {
  if (!coordenadasGeograficasValidas(latitude, longitude)) return false
  return (
    distanciaEmMetros({ latitude, longitude }, LOCALIZACAO_ACADEMIA) <=
    RAIO_CHECKIN_GEOLOCALIZACAO_METROS
  )
}
