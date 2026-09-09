import { contaAsaasProfessorSchema } from "@/lib/validations/conta-asaas-professor"

// O onboarding não-BaaS para pessoa física exige o mesmo conjunto cadastral.
// O domínio e a persistência continuam separados da conta de professor.
export const contaAsaasLojaSchema = contaAsaasProfessorSchema

export type ContaAsaasLojaInput = ReturnType<typeof contaAsaasLojaSchema.parse>
