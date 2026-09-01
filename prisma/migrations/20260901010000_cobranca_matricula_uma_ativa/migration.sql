CREATE UNIQUE INDEX "CobrancaMatriculaAsaas_uma_ativa_por_solicitacao_key"
ON "CobrancaMatriculaAsaas"("solicitacaoId")
WHERE "ativa" = TRUE;
