import { Label } from "@/components/ui/label"

/** Lista de checkboxes de modalidades para formulários (name="modalidadeIds"). */
export function SeletorModalidades({
  modalidades,
}: {
  modalidades: { id: string; nome: string }[]
}) {
  return (
    <div className="space-y-1.5">
      <Label>Modalidades</Label>
      <div className="flex flex-wrap gap-2">
        {modalidades.map((m) => (
          <label
            key={m.id}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
          >
            <input type="checkbox" name="modalidadeIds" value={m.id} className="accent-primary" />
            {m.nome}
          </label>
        ))}
        {modalidades.length === 0 && (
          <p className="text-sm text-muted-foreground">Cadastre uma modalidade primeiro.</p>
        )}
      </div>
    </div>
  )
}
