# Rastreabilidade — requisito ↔ entidade ↔ código

Mapa para localizar onde cada requisito vive. Atualize ao implementar cada fase.
Status: ✅ feito · 🚧 em andamento · ⬜ pendente.

## Fundação (Fase 0) — ✅
| Tema | Entidade(s) | Arquivos |
| --- | --- | --- |
| Autenticação usuário+senha, troca própria e redefinição por gestor (RNF-004) | `Usuario`,`LogAuditoria` | `src/lib/auth/{session,senha,dal}.ts`, `src/lib/services/usuario.service.ts`, `src/app/actions/auth.ts`, `src/app/(auth)/login/*`, `{gestao,professor}/perfil`, `aluno/perfil`, `gestao/usuarios` |
| RBAC por papel (RNF-004) | — | `src/lib/auth/dal.ts` (`exigirPapel`), `src/proxy.ts` |
| Cadastro/listagem de gestores do sistema | `Usuario` | `src/lib/services/gestor.service.ts`, `src/app/actions/cadastros.ts`, `gestao/gestores` |
| Auditoria (RF-079/080) | `LogAuditoria` | `src/lib/services/auditoria.service.ts` |
| Design system (paleta/logo) | — | `src/app/globals.css`, `src/components/ui/*`, `src/components/marca.tsx` |
| Configuração da academia (RF-014/022/051) | `ConfiguracaoAcademia` | `prisma/schema.prisma` |

## Núcleo de treino (Fase 1) — ✅
| Requisito | Entidade(s) | Arquivos |
| --- | --- | --- |
| Cadastro aluno/professor/modalidade com foto e auditoria (RF-001/005/008/RF-079) | `Aluno`,`Professor`,`Modalidade`,`LogAuditoria` | `src/lib/services/{aluno,professor,modalidade}.service.ts`, `gestao/{alunos,professores,modalidades}` |
| Status e tipo do aluno com auditoria (RF-002/RF-054/RF-079) | `Aluno`,`LogAuditoria` | `src/lib/services/aluno.service.ts`, `src/app/actions/cadastros.ts`, `gestao/alunos` |
| Status do professor com bloqueio de login e auditoria (RF-005/RF-079) | `Professor`,`Usuario`,`LogAuditoria` | `src/lib/services/professor.service.ts`, `src/app/actions/cadastros.ts`, `gestao/professores` |
| Configuração de modalidade, status, professores habilitados, regras próprias de treino e catálogo de graduações (RF-009/RF-040) | `Modalidade`,`Professor`,`Graduacao` | `src/lib/services/{modalidade,configuracao,graduacao}.service.ts`, `src/app/actions/cadastros.ts`, `gestao/modalidades` |
| Professor substituto em aula (RF-007) | `Aula`,`LogAuditoria` | `src/lib/services/turma.service.ts`, `src/app/actions/turmas.ts`, `gestao/turmas` |
| Turmas com status, edição operacional e geração de aulas com auditoria (RF-010/011/RF-079) | `Turma`,`Aula`,`LogAuditoria` | `src/lib/services/turma.service.ts`, `src/app/actions/cadastros.ts`, `src/app/api/tarefas/gerar-aulas-futuras/route.ts`, `gestao/turmas` |
| Aulas avulsas e cancelamento (RF-012/RF-073..078) | `Turma`,`Aula`,`LogAuditoria`,`Notificacao` | `src/lib/services/turma.service.ts`, `src/app/actions/turmas.ts`, `gestao/turmas`, `{aluno,gestao}/notificacoes` |
| Configurações operacionais (RF-014/022/051) | `ConfiguracaoAcademia` | `src/lib/services/configuracao.service.ts`, `src/app/actions/configuracoes.ts`, `gestao/configuracoes` |
| Comparecimento + janela + lista de espera + no-show (RF-013..018) | `Comparecimento`,`LogAuditoria`,`Notificacao` | `src/lib/services/comparecimento.service.ts`, `src/app/actions/treino.ts`, `aluno`, `professor/aula/[id]` |
| Check-in por QR global, token rotacionável, lançamento por professor/gestor, histórico e validações de status, financeiro, comparecimento, janela e vagas (RF-019..024) | `Checkin`,`TokenCheckinAcademia`,`TentativaCheckinInadimplente`,`Notificacao` | `src/lib/services/{checkin,checkin-token,aula-monitoramento}.service.ts`, `src/app/actions/{treino,checkin-qrcode}.ts`, `gestao/checkin/qrcode`, `{professor,gestao}/aula/[id]`, `aluno/checkin`, `aluno/checkin/passe/[checkinId]`, `aluno/perfil` |
| Presença derivada e pendência de revisão (RF-025/026/029) | `Checkin` | `checkin.service.ts`, `professor/turmas` (lista da aula), `aluno/checkin/[aulaId]` |
| Observações técnicas do aluno pelo professor (RF-003/RF-026/RF-079) | `Aluno`,`LogAuditoria` | `src/lib/services/aluno.service.ts`, `src/app/actions/treino.ts`, `professor/aula/[id]`, `aluno/perfil` |
| Registro retroativo de check-in com justificativa e auditoria (RF-031) | `Checkin`,`LogAuditoria` | `checkinRetroativo`, `realizarCheckin`, `acaoLancarCheckin`, `professor/aula/[id]` |
| Horas + estorno (RF-030..039) | `MovimentoHoras` | `src/lib/services/horas.service.ts`, `aluno/horas` |
| Acompanhamento de horas por modalidade pelo professor (RF-026/RF-032/RF-033) | `MovimentoHoras`,`Aluno`,`Modalidade` | `professor/graduacoes` |
| Ajuste manual de horas com auditoria (RF-038) | `MovimentoHoras`,`LogAuditoria` | `src/lib/services/horas.service.ts`, `src/app/actions/horas.ts`, `gestao/alunos`, `professor/graduacoes` |
| Invalidação por professor/gestor (RF-027/028/035) | `Checkin`,`MovimentoHoras`,`LogAuditoria` | `checkin.service.ts`, `auditoria.service.ts`, `professor/aula/[id]`, `gestao/turmas/aula/[id]` |
| Perfil do aluno com histórico de graduações, comparecimentos/check-ins, documentos e conciliação (RF-003/RF-041/RF-042/RF-063/RF-064) | `Aluno` e relações, `GraduacaoAluno`,`Comparecimento`,`Checkin`,`DocumentoAluno`, `RegistroImportado` | `aluno/perfil`, `gestao/alunos`, `aluno/graduacoes` |

## Graduação (Fase 2) — ✅
| Requisito | Entidade(s) | Arquivos |
| --- | --- | --- |
| Graduação atual + histórico com grau anterior e novo (RF-041/042) | `GraduacaoAluno.graduacaoAnteriorId` | `src/lib/services/graduacao.service.ts`, `professor/graduacoes`, `aluno/graduacoes`, `aluno/perfil` |
| Registro manual pelo professor (RF-043/RN-010/CA-018) | `GraduacaoAluno`,`LogAuditoria` | `src/app/actions/graduacoes.ts`, `src/lib/services/graduacao.service.ts` |
| Critérios de elegibilidade sem graduação automática (RF-044/RN-010) | `Graduacao`,`MovimentoHoras` | `avaliarElegibilidade`, `professor/graduacoes`, `aluno/graduacoes` |
| Exames de graduação: criação, inscrição, resultado, taxa e nova graduação (RF-045) | `Exame`,`InscricaoExame`,`GraduacaoAluno` | `src/lib/services/graduacao.service.ts`, `src/app/actions/graduacoes.ts`, `professor/graduacoes`, `aluno/graduacoes` |

## Financeiro (Fase 3) — ✅
| Requisito | Entidade(s) | Arquivos |
| --- | --- | --- |
| Cadastro de plano + vínculo ao aluno com mensalidade interna e vencimento por aluno (RF-046/047) | `Plano`,`Aluno.diaVencimento` | `src/lib/services/financeiro.service.ts`, `src/app/actions/financeiro.ts`, `gestao/financeiro`, `gestao/alunos` |
| Mensalidades, status ajustável com auditoria, adimplência e lembretes para gestores (RF-048..051/RF-073..078/RF-079) | `Mensalidade`,`ConfiguracaoAcademia`,`LogAuditoria`,`Notificacao` | `financeiro.service.ts`, `src/app/api/tarefas/lembretes-financeiros/route.ts`, `gestao/financeiro`, `aluno/financeiro`, `checkin.service.ts`, `comparecimento.service.ts` |
| Pagamentos avulsos (RF-052) | `Pagamento` | `financeiro.service.ts`, `gestao/financeiro`, `aluno/financeiro` |
| Wellhub/TotalPass com plano mensal interno por modalidade (RF-053) | `Aluno.tipo`,`Aluno.planoId`,`AlunoPlanoModalidade` | `financeiro.service.ts`, `checkin.service.ts`, `comparecimento.service.ts`, `aluno/financeiro` |
| Divisão de receita e repasse professor/sócios (RF-053.1/RF-064.1/RN-017/RN-018) | `ConfiguracaoAcademia.valorBaseModalidade`,`RegistroImportado.valorRepasse` | `calcularRepasseFinanceiro`, `conciliacao.service.ts`, `gestao/configuracoes`, `gestao/conciliacao` |

## Conciliação (Fase 4) — ✅
| Requisito | Entidade(s) | Arquivos |
| --- | --- | --- |
| Importação CSV/XLSX Wellhub/TotalPass com metadados (RF-057/058/064) | `Importacao`,`RegistroImportado` | `src/lib/services/conciliacao.service.ts`, `src/app/actions/conciliacao.ts`, `src/app/api/importacao/route.ts`, `gestao/conciliacao` |
| Identificação do aluno por prioridade (RF-059/RN-015) | `Aluno` | `identificarAluno`, `normalizarLinha` |
| Conciliação com check-ins e status (RF-060/061/RN-016) | `RegistroImportado`,`Checkin` | `classificarConciliacao`, `gestao/conciliacao` |
| Resolução manual com log (RF-062/CA-016) | `RegistroImportado`,`LogAuditoria` | `resolverConciliacaoManual`, `acaoResolverConciliacao` |
| Relatório/histórico de conciliação (RF-063/064) | `Importacao`,`RegistroImportado` | `gestao/conciliacao` |

## Relatórios / Notificações / Auditoria UI (Fase 5) — ✅
| Requisito | Entidade(s) | Arquivos |
| --- | --- | --- |
| Relatórios básicos com filtro de período, quebras por status/tipo e ranking configurável de horas (RF-065..072) | vários | `gestao/relatorios`, `ConfiguracaoAcademia.rankingHorasAtivo` |
| Notificações configuráveis de eventos críticos, comparecimento, lembrete de treino, financeiro, aniversário, graduação e check-in invalidado (RF-073..078) | `Notificacao`,`ConfiguracaoAcademia` | `src/lib/services/notificacao.service.ts`, `src/lib/services/{comparecimento,financeiro,graduacao,checkin}.service.ts`, `src/app/api/tarefas/lembretes-diarios/route.ts`, `gestao/configuracoes`, `src/components/notificacoes-page.tsx`, `{gestao,professor,aluno}/notificacoes` |
| Auditoria de ações críticas (RF-079/080) | `LogAuditoria` | `src/lib/services/auditoria.service.ts`, `gestao/auditoria` |
