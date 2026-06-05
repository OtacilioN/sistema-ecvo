import { PrismaClient } from "@prisma/client"

// Singleton do PrismaClient para evitar múltiplas conexões em dev (hot-reload) e
// reuso em funções serverless. Em produção (Vercel + Neon) o pool é gerenciado
// pela connection string "pooled" em DATABASE_URL.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
