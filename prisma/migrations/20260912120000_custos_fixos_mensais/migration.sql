-- CreateTable
CREATE TABLE "CustoFixoMensal" (
    "competencia" TEXT NOT NULL,
    "aluguel" DECIMAL(12,2) NOT NULL,
    "energia" DECIMAL(12,2) NOT NULL,
    "agua" DECIMAL(12,2) NOT NULL,
    "internet" DECIMAL(12,2) NOT NULL,
    "limpeza" DECIMAL(12,2) NOT NULL,
    "outros" DECIMAL(12,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustoFixoMensal_pkey" PRIMARY KEY ("competencia"),
    CONSTRAINT "CustoFixoMensal_competencia_check" CHECK (
        "competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left("competencia", 4) <> '0000'
    ),
    CONSTRAINT "CustoFixoMensal_valores_check" CHECK (
        "aluguel" >= 0 AND "energia" >= 0 AND "agua" >= 0
        AND "internet" >= 0 AND "limpeza" >= 0 AND "outros" >= 0
    )
);
