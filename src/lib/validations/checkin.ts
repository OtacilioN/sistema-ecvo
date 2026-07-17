import { z } from "zod"

export const coordenadasCheckinSchema = z.object({
  aulaId: z.string().min(1, "Aula inválida"),
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
})
