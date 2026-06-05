import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "ECVO — Escola de Combate",
    template: "%s · ECVO",
  },
  description:
    "Sistema de gerenciamento da ECVO: alunos, grade de treinos, check-in, horas treinadas e graduações.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ECVO",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#ef1a1f",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  )
}
