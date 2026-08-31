"use client"

import { type PlataformaCheckin, textoConfirmacaoCheckinPlataforma } from "@/lib/checkin-plataforma"

export function ConfirmacaoCheckinPlataforma({
  plataforma,
  confirmada,
  onChange,
}: {
  plataforma: PlataformaCheckin
  confirmada: boolean
  onChange: (confirmada: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
      <input
        type="checkbox"
        name="confirmouCheckinPlataforma"
        checked={confirmada}
        required
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="font-medium leading-relaxed">
        {textoConfirmacaoCheckinPlataforma(plataforma)}
      </span>
    </label>
  )
}
