CREATE TYPE "StatusContaAsaasProfessor" AS ENUM (
  'CRIANDO',
  'RESULTADO_INDETERMINADO',
  'AGUARDANDO_ATIVACAO',
  'AGUARDANDO_APROVACAO',
  'HABILITADA',
  'BLOQUEADA',
  'ERRO',
  'DESABILITADA'
);

ALTER TYPE "TipoAcaoAudit" ADD VALUE IF NOT EXISTS 'CONTA_ASAAS_PROFESSOR_SOLICITADA';

CREATE TABLE "ContaAsaasProfessor" (
  "id" TEXT NOT NULL,
  "professorId" TEXT NOT NULL,
  "nomeTitular" TEXT NOT NULL,
  "emailContaAsaas" TEXT NOT NULL,
  "cpfCnpj" TEXT NOT NULL,
  "dataNascimento" TIMESTAMP(3) NOT NULL,
  "celular" TEXT NOT NULL,
  "rendaMensal" DECIMAL(12, 2) NOT NULL,
  "logradouro" TEXT NOT NULL,
  "numeroEndereco" TEXT NOT NULL,
  "complemento" TEXT,
  "bairro" TEXT NOT NULL,
  "cep" TEXT NOT NULL,
  "status" "StatusContaAsaasProfessor" NOT NULL DEFAULT 'CRIANDO',
  "asaasAccountId" TEXT,
  "walletId" TEXT,
  "consentimentoVersao" TEXT NOT NULL,
  "consentidoEm" TIMESTAMP(3) NOT NULL,
  "solicitadoEm" TIMESTAMP(3),
  "ultimoErro" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContaAsaasProfessor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContaAsaasProfessor_rendaMensal_check" CHECK ("rendaMensal" > 0),
  CONSTRAINT "ContaAsaasProfessor_cpfCnpj_check" CHECK ("cpfCnpj" ~ '^[0-9]{11}$'),
  CONSTRAINT "ContaAsaasProfessor_celular_check" CHECK ("celular" ~ '^[0-9]{10,11}$'),
  CONSTRAINT "ContaAsaasProfessor_cep_check" CHECK ("cep" ~ '^[0-9]{8}$'),
  CONSTRAINT "ContaAsaasProfessor_habilitada_check" CHECK (
    "status" <> 'HABILITADA' OR ("asaasAccountId" IS NOT NULL AND "walletId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ContaAsaasProfessor_professorId_key"
  ON "ContaAsaasProfessor"("professorId");
CREATE UNIQUE INDEX "ContaAsaasProfessor_emailContaAsaas_key"
  ON "ContaAsaasProfessor"("emailContaAsaas");
CREATE UNIQUE INDEX "ContaAsaasProfessor_asaasAccountId_key"
  ON "ContaAsaasProfessor"("asaasAccountId");
CREATE UNIQUE INDEX "ContaAsaasProfessor_walletId_key"
  ON "ContaAsaasProfessor"("walletId");
CREATE INDEX "ContaAsaasProfessor_status_idx"
  ON "ContaAsaasProfessor"("status");

ALTER TABLE "ContaAsaasProfessor"
  ADD CONSTRAINT "ContaAsaasProfessor_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
