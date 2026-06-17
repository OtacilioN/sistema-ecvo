# Glossário — ECVO

Termos do domínio (pt-BR). Use exatamente esta terminologia em UI, relatórios e novas regras.
O modelo técnico legado `Comparecimento` representa o agendamento da aula pelo aluno.

| Termo | Significado |
| --- | --- |
| **Agendamento de aula** | Reserva/sinalização do aluno para participar de um treino específico. **Não** gera presença nem horas (RN-001). Janela padrão: a partir de 24h antes da aula. |
| **Check-in** | Confirmação de chegada/participação do aluno no treino. Pode ser por botão, QR Code ou lançado por gestor/professor. |
| **Presença** | Resultado derivado de um **check-in válido** (RN-002). Não é uma tabela própria: presença ≡ existe `Checkin` com `status = VALIDO`. |
| **Invalidar / excluir check-in** | Ação de professor/gestor quando o aluno fez check-in mas não treinou. Remove a presença e **estorna** as horas, com log de auditoria (RF-027/028/035). |
| **Estorno de horas** | Movimento negativo no livro-razão de horas que reverte um crédito (por invalidação de check-in). As horas originais não são apagadas. |
| **Horas treinadas** | Soma das durações das aulas com check-in válido. Exibidas no total geral (jornada das 10 mil horas) e por modalidade (RF-032/033). |
| **Marco** | Marca de progresso de horas (10, 50, 100, 250, 500, 1.000, 2.500, 5.000, 10.000h) — engajamento, não promessa (RF-036/037). |
| **Graduação** | Faixa/nível do aluno em uma modalidade (ex.: faixa azul de jiu-jitsu). Concedida pelo professor; nunca automática (RN-009/010). |
| **Modalidade** | Esporte/disciplina oferecido (jiu-jitsu, kickboxing, muay thai, boxe, MMA, wrestling, defesa pessoal, funcional…). |
| **Turma** | Horário recorrente de treino (dia da semana + hora) **ou** evento único (aulão, seminário, open mat, exame). |
| **Aula** | Ocorrência datada concreta de uma turma. |
| **Mensalista** | Aluno com mensalidade contratada diretamente com a academia (controle financeiro completo). |
| **Wellhub / TotalPass** | Aluno vinculado a plataforma externa. Pode também ter plano mensal interno para modalidades pagas diretamente à academia; o uso externo segue conciliação por planilha (sem API no MVP). |
| **Avulso** | Aluno que paga por aula, diária, pacote, seminário ou evento pontual. |
| **Adimplência / Inadimplência** | Situação de pagamento de plano mensal interno (em dia / em atraso). Pode bloquear agendamento/check-in conforme configuração (RF-051). |
| **Repasse financeiro** | Divisão da arrecadação entre professor, sócio A e sócio B. Mensalidade interna usa cascata por valor base; Wellhub/TotalPass divide o valor repassado diretamente em 60% professor, 20% sócio A e 20% sócio B. |
| **Conciliação** | Comparação dos registros importados (Wellhub/TotalPass) com o histórico interno de check-ins (RF-060). |
| **Divergência** | Registro importado que não casa com o histórico interno (aluno não identificado, data/horário divergente, check-in invalidado etc.). |
| **No-show** | Aluno agendou a aula mas não fez check-in (RF-018). |
| **Auditoria** | Registro imutável de ações críticas: autor, data/hora, entidade, valor antigo/novo, justificativa (RF-079/080). |
