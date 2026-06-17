# Requisitos — Sistema ECVO

Transcrição estruturada do documento de requisitos (`documento_requisitos_ecvo.pdf`). Fonte de verdade
para o escopo. Veja também `glossario.md` e `rastreabilidade.md`.

## 1. Visão geral

Web app para gerenciar a ECVO, escola de combate com múltiplas modalidades (kickboxing, boxe, muay thai,
no-gi, jiu-jitsu, MMA, wrestling, defesa pessoal e outras cadastráveis). Organiza alunos, professores,
modalidades, horários, intenções de treino, check-ins, presenças, horas treinadas, graduações, pagamentos e
conciliação de alunos Wellhub/TotalPass.

Diferencial central: acompanhamento da evolução por **horas treinadas** (jornada das 10 mil horas), com
total geral e por modalidade.

Conceitos-chave (ver glossário): **intenção de treino** ≠ **check-in** (participação) ⇒ **presença**
(derivada de check-in válido).

## 2. Papéis

- **Gestor** — administra a academia (pode haver vários).
- **Secretaria** — acessa a visão administrativa em modo majoritariamente leitura; pode cadastrar alunos e
  editar dados gerais de aluno.
- **Professor** — ministra aulas, acompanha alunos, invalida check-ins indevidos, registra observações e graduações.
- **Aluno** — acessa a grade, marca intenção de treino, faz check-in, acompanha evolução.

## 3. Tipos de aluno

Mensalista, Wellhub, TotalPass, Avulso. A **experiência de treino é igual** para todos; difere a **gestão
financeira** e a **conciliação**. Wellhub/TotalPass podem ter também um plano mensal interno para
modalidades pagas diretamente à academia.

## 4. Escopo do MVP

Dentro: cadastros (gestor/professor/aluno), classificação de aluno por tipo, modalidades, turmas e horários,
grade para o aluno, intenção de treino, check-in, presença automática por check-in válido, invalidação de
check-in, contador de horas (geral e por modalidade), perfil do aluno, graduações + registro pelo professor,
financeiro de mensalistas, pagamentos avulsos, importação Wellhub/TotalPass + conciliação, relatórios básicos.

Fora do MVP: integrações automáticas via API (Wellhub/TotalPass/Gympass), webhooks, conciliação financeira
automática, reconhecimento facial, app mobile nativo, papéis separados (coordenador/financeiro/contador),
aluno experimental.

## 5. Permissões por papel (resumo)

- **Gestor**: CRUD de alunos/professores/gestores/modalidades/turmas; planos e mensalidades; pagamentos;
  inadimplência; relatórios; importação e conciliação; configurações; invalidar check-ins; auditoria.
- **Secretaria**: visão administrativa de leitura para cadastros, turmas, financeiro, conciliação,
  relatórios, auditoria e configurações; pode cadastrar alunos e editar dados gerais de aluno.
- **Professor**: ver suas aulas; ver intenções/check-ins/presentes; invalidar check-ins; histórico
  técnico; horas por modalidade; observações; registrar e consultar graduações. Não gerencia financeiro.
- **Aluno**: ver a própria grade; marcar/cancelar intenção de treino; fazer check-in; consultar check-ins,
  presenças, horas (geral e por modalidade), graduações, perfil e pendências financeiras (se houver plano
  mensal interno).

## 6. Requisitos funcionais (RF)

### Gestão de alunos
- **RF-001** Cadastro de aluno (nome, CPF, nascimento, telefone, e-mail, endereço, foto, tipo, status,
  modalidades, data de início, contato de emergência, observações admin/técnicas, restrições médicas,
  identificador externo).
- **RF-002** Status: Ativo, Inativo, Suspenso, Cancelado, Inadimplente, Trancado.
- **RF-003** Perfil do aluno (dados, tipo, status, modalidades, plano, situação financeira, históricos de
  intenção/check-in/invalidações/presença, horas gerais e por modalidade, graduações e histórico,
  observações técnicas, documentos, histórico de conciliação).
- **RF-004** Aluno menor de idade vinculado a um responsável (nome, CPF, telefone, e-mail, parentesco,
  responsabilidade financeira).

### Gestão de professores
- **RF-005** Cadastro de professor (nome, CPF, telefone, e-mail, foto, modalidades, status, observações).
- **RF-006** Vínculo professor ↔ turmas/horários.
- **RF-007** Professor substituto: gestor altera o professor de uma aula, mantendo registro de quem ministrou.

### Modalidades
- **RF-008** Cadastro de modalidades (lista + personalizadas).
- **RF-009** Configurações da modalidade (nome, descrição, duração padrão, status, graduações associadas,
  professores habilitados, regras específicas de check-in/intenção).

### Turmas e horários
- **RF-010** Cadastro de turma/horário (modalidade, professor, dia, início, fim, duração, capacidade, local,
  nível, status).
- **RF-011** Grade recorrente por dia da semana.
- **RF-012** Aulas avulsas (aulão, seminário, open mat, sparring day, treino especial, exame).

### Intenção de treino
- **RF-013** Marcação de intenção em aula disponível.
- **RF-014** Janela de intenção configurável (padrão 24h antes).
- **RF-015** Cancelamento de intenção (prazo configurável).
- **RF-016** Limite de vagas (capacidade; bloqueio ou lista de espera se ativa).
- **RF-017** Status da intenção (Confirmado, Cancelado pelo aluno, Cancelado pelo gestor, Convertido em
  check-in, Ausente, No-show).
- **RF-018** No-show: marcou intenção mas não fez check-in.

### Check-in
- **RF-019** Realização de check-in (botão, QR Code, lançamento por gestor/professor).
- **RF-020** Validação (aluno ativo; permissão; plano mensal interno adimplente se configurado; aula
  existente; há intenção se exigida; vaga disponível).
- **RF-021** Check-in associado à intenção correspondente.
- **RF-022** Check-in sem intenção prévia: permitir / bloquear / apenas com aprovação.
- **RF-023** Check-in válido gera presença automaticamente e horas conforme a duração da aula.
- **RF-024** Histórico de check-ins (data, hora, aula, modalidade, método, responsável, status, validade).

### Presença e invalidação
- **RF-025** Presença derivada de todo check-in válido.
- **RF-026** Lista da aula para o professor (comparecidos, com check-in, presentes, sem check-in, invalidados, observações).
- **RF-027** Professor exclui/invalida check-in → remove presença, estorna horas, registra autor/data/justificativa, mantém histórico.
- **RF-028** Gestor também pode excluir/invalidar check-ins.
- **RF-029** Status de presença (Presente por check-in, Ausente, Check-in invalidado, Check-in excluído, Pendente de revisão).
- **RF-030** Check-in válido gera presença+horas; invalidado/excluído não conta e estorna horas já geradas.
- **RF-031** Registro retroativo (com data da alteração, responsável, justificativa, auditoria).

### Horas treinadas
- **RF-032** Total geral de horas. **RF-033** Total por modalidade.
- **RF-034** Cálculo automático ao check-in válido (soma duração ao total geral e da modalidade).
- **RF-035** Estorno de horas por invalidação, mantendo registro do estorno.
- **RF-036** Progresso rumo às 10 mil horas (engajamento). **RF-037** Marcos intermediários.
- **RF-038** Ajuste manual de horas (modalidade, quantidade, motivo, responsável, auditoria);
  professores só podem lançar horas positivas para alunos vinculados às suas modalidades.
- **RF-039** Prevenção de duplicidade (mesma aula não conta duas vezes).

### Graduação
- **RF-040** Cadastro de graduações por modalidade. **RF-041** Graduação atual por modalidade.
- **RF-042** Histórico de graduação (modalidade, anterior, nova, data, professor, observações, anexo).
- **RF-043** Registro de graduação pelo professor.
- **RF-044** Critérios de elegibilidade (horas, frequência, tempo no grau, exame, avaliação) — **não graduam automaticamente**.
- **RF-045** Exames de graduação (data, modalidade, professor, inscritos, resultado, nova graduação, taxa).

### Financeiro
- **RF-046** Cadastro de plano. **RF-047** Vínculo do plano ao aluno com mensalidade interna. **RF-048**
  Registro de mensalidades.
- **RF-049** Status financeiro (Em aberto, Paga, Vencida, Cancelada, Isenta).
- **RF-050** Adimplência. **RF-051** Bloqueio por inadimplência (alertar / bloquear intenção / bloquear check-in / não aplicar).
- **RF-052** Pagamentos avulsos (aula, diária, pacote, seminário, evento, exame, produto).
- **RF-053** Wellhub/TotalPass podem combinar vínculo externo com plano mensal interno por modalidade.
- **RF-053.1** Divisão de receita de mensalidade interna: valor base global por modalidade; professor recebe
  até 60% do valor base cheio por modalidade; sócio A e sócio B dividem o excedente igualmente. Descontos
  reduzem primeiro a parte dos sócios e, se a arrecadação não atingir o teto dos professores, reduzem
  proporcionalmente a parte dos professores.

### Wellhub e TotalPass
- **RF-054** Cadastro do tipo de vínculo. **RF-055** Mesmo fluxo operacional de treino.
- **RF-056** Sem integração automática via API no MVP.
- **RF-057/058** Importação de planilhas Wellhub/TotalPass (CSV/XLSX) com metadados da importação.
- **RF-059** Identificação do aluno (CPF prioritário → e-mail → nome → telefone → identificador externo).
- **RF-060** Conciliação com histórico interno. **RF-061** Status de conciliação.
- **RF-062** Resolução manual de divergências (com log). **RF-063** Relatório de conciliação. **RF-064** Histórico de importações.
- **RF-064.1** Divisão de repasse Wellhub/TotalPass: professor recebe 60% do valor repassado pela plataforma
  no período; sócio A recebe 20%; sócio B recebe 20%.

### Relatórios
- **RF-065..072** Alunos, intenções, check-ins, presença, horas, graduação, financeiro, conciliação.

### Notificações
- **RF-073..078** Intenção, lembrete de treino, cancelamento de aula, financeiro, graduação, check-in invalidado (configurável).

### Auditoria
- **RF-079** Log para ações críticas. **RF-080** Cada log: usuário, data/hora, tipo de ação, entidade, valor anterior, valor novo, justificativa.

## 7. Regras de negócio (RN)

RN-001 intenção não é presença · RN-002 check-in válido conta presença · RN-003 professor atua nas
exceções · RN-004 professor pode invalidar check-in · RN-005 check-in invalidado não conta horas (estorna) ·
RN-006 horas vinculadas à modalidade · RN-007 horas também somam ao total geral · RN-008 aluno pode ter
várias graduações · RN-009 professor é responsável pela graduação · RN-010 critérios não graduam
automaticamente · RN-011 Wellhub/TotalPass conciliam por planilha no MVP · RN-012 plano mensal interno tem
controle financeiro · RN-013 avulso tem pagamentos pontuais · RN-014 **não existe aluno experimental** ·
RN-015 CPF tem prioridade na identificação · RN-016 check-in invalidado deve aparecer na conciliação ·
RN-017 repasse de mensalidade interna usa cascata: professores até o teto por modalidade, depois sócios ·
RN-018 repasse Wellhub/TotalPass divide o valor repassado diretamente em 60/20/20.

RN-019 vencimento da mensalidade interna é configurado por aluno, com dia 10 como padrão inicial.
RN-020 plano é um pacote comercial disponível para qualquer modalidade; as modalidades contratadas são
definidas no vínculo aluno-plano e devem ser subconjunto das modalidades do aluno.

## 8. Requisitos não funcionais (RNF)

RNF-001 web responsivo · RNF-002 experiência mobile do aluno · RNF-003 performance em telas críticas ·
RNF-004 segurança (autenticação usuário+senha, sessão, RBAC por papel, proteção de acesso, criptografia em
trânsito) · RNF-005 privacidade/LGPD · RNF-006 auditoria · RNF-007 backup · RNF-008 escalabilidade ·
RNF-009 disponibilidade · RNF-010 usabilidade (ações principais simples e rápidas).

## 9. Critérios de aceite (CA)

CA-001 cadastro de aluno · CA-002 tipos válidos · CA-003 intenção na janela · CA-004 janela de 24h ·
CA-005 check-in registra data/hora/aluno/aula · CA-006 check-in gera presença · CA-007 contagem de horas
(1h30 → +1h30 geral e modalidade) · CA-008 invalidação remove presença e estorna horas · CA-009 auditoria da
invalidação · CA-010 mensalista inadimplente aplica regra configurada · CA-011/012 Wellhub/TotalPass sem API ·
CA-013/014 importação concilia com histórico · CA-015 registro não conciliado → pendente · CA-016 conciliação
manual com log · CA-017 check-in invalidado sinaliza divergência · CA-018 graduação atualiza atual + histórico.

## 10. Fluxos principais

Mensalista/Wellhub/TotalPass/Avulso seguem: cadastro → grade → intenção → check-in → presença → horas;
professor invalida nas exceções. Wellhub/TotalPass adicionam importação + conciliação. Graduação: professor
avalia → registra → atualiza atual + histórico. Importação: selecionar plataforma → importar CSV/XLSX →
identificar alunos → comparar com check-ins → classificar status → revisar/resolver → log.
