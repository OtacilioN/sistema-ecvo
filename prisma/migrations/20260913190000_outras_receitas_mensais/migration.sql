-- CreateTable: sem preenchimento retroativo de receitas.
CREATE TABLE "OutraReceitaMensal" (
    "competencia" TEXT NOT NULL,
    "aluguelHorario" DECIMAL(12,2) NOT NULL,
    "outros" DECIMAL(12,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutraReceitaMensal_pkey" PRIMARY KEY ("competencia"),
    CONSTRAINT "OutraReceitaMensal_competencia_check" CHECK (
        "competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left("competencia", 4) <> '0000'
    ),
    CONSTRAINT "OutraReceitaMensal_valores_check" CHECK (
        "aluguelHorario" >= 0 AND "outros" >= 0
    )
);
