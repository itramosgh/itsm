## Context

Ver proposal.md - Why. O cálculo hoje é feito puramente em JS no cron `ticket-automations` (`route.ts`), comparando `now - ticket.updated_at` em horas cruas. `src/lib/sla.ts` já tem um motor de horário comercial (`isBusinessDay`, `addBusinessHours`) timezone-aware (São Paulo) que conta horas dentro de uma janela de expediente (ex: 9h-18h) — não serve direto aqui porque o pedido é diferente: contar o dia útil inteiro (24h), só descontando fim de semana/feriado, sem travar em janela de expediente.

## Goals / Non-Goals

**Goals:**
- Um helper reaproveitável (`addBusinessDays`) que soma horas a partir de uma data, pulando dias não-úteis inteiros, contando 24h corridas nos dias úteis.
- Mesma fonte de dados de dia útil e feriado já usada pelo SLA (`platform_settings.business_hours_days`, tabela `holidays`) — nenhuma configuração nova.
- Aplicar o helper nos dois pontos do cron que hoje fecham/expiram por tempo corrido: `aguardando_cliente` (lembrete 24h + fechamento 48h) e `ticket_approvals` pendente (expiração 48h).

**Non-Goals:**
- Não altera o motor de SLA (`addBusinessHours`, `calculateDeadline`) nem o comportamento de pausa de SLA em `aguardando_fornecedor`.
- Não adiciona configuração nova de fim de semana — deriva de `business_hours_days` existente.
- Não persiste um `deadline` calculado no banco; o cron continua recalculando a cada execução a partir de `updated_at` / `created_at`.
- Não corrige o problema pré-existente de `updated_at` ser tocado por qualquer alteração no chamado (não só resposta do cliente) — fora de escopo.

## Decisions

**1. Nova função em `src/lib/sla.ts`, não em arquivo separado.**
`addBusinessDays(start: Date, hours: number, businessDays: number[], holidays: string[]): Date` fica junto de `isBusinessDay`/`getSaoPauloDateParts` porque precisa dos mesmos helpers privados de timezone (não exportados hoje). Alternativa considerada: novo arquivo `business-days.ts` — descartada porque exigiria exportar helpers internos do `sla.ts` só para reuso externo, aumentando a superfície pública sem necessidade.

Algoritmo: anda dia a dia a partir de `start` (limite de dia = meia-noite em São Paulo, mesma lógica de `nextBusinessDayStart`); se o dia é útil (`isBusinessDay`), consome até 24h do saldo dentro desse dia; se não é útil, pula o dia inteiro sem consumir saldo. Retorna a data quando o saldo de horas chega a zero.

**2. Dia útil derivado de `business_hours_days`, feriado de `holidays` — mesma fonte do SLA.**
Evita nova configuração e mantém consistência: se a empresa alguma vez configurar sábado como dia útil para SLA, o auto-fechamento acompanha automaticamente.

**3. Exceção 24x7 checada por contrato, não por chamado.**
`tickets.contract_id` já referencia `contracts.is_24x7` diretamente (setado na criação do chamado) — não precisa repetir a lógica de "contrato ativo mais recente da empresa" que `ticket-sla.ts` usa (essa lógica é para quando o chamado ainda não tem contrato resolvido). Aqui o chamado já existe e já tem `contract_id` (ou não tem, tratado como não-24x7 pela spec).

**4. `ticket_approvals`: prefiltro SQL vira busca larga + filtro em JS.**
Hoje a query filtra `created_at < now - 48h` direto no banco. Como o deadline passa a depender de contrato/feriado (variável por linha), não dá para expressar em SQL simples. Troca por buscar candidatos com uma janela larga (ex: `created_at < now - 7 dias`, cobre qualquer combinação razoável de feriados emendados) e calcular o deadline real em JS por linha, igual ao bloco `aguardando_cliente`. Volume de `ticket_approvals` pendentes é baixo (uma aprovação por vez por chamado em mudança/fatura), sem preocupação de performance.

**5. Busca de feriados cobre o passado, não só o futuro.**
`ticket-sla.ts` busca feriados `>= createdAt` (só olha pra frente, é usado na criação do chamado). Aqui o cron precisa saber se houve feriado *entre* `updated_at`/`created_at` (no passado) e agora — a query de `holidays` no cron busca num intervalo que cobre do menor `updated_at`/`created_at` relevante até hoje.

## Risks / Trade-offs

- **[Risco] Ticket com `contract_id` apontando pra contrato expirado/inativo ainda é lido normalmente (join não filtra `status = 'ativo'`)** → aceitável: o que importa aqui é só o flag `is_24x7` do contrato que o chamado carrega, não o status do contrato. Mesmo contrato expirado, é a referência correta.
- **[Risco] Mudar o filtro SQL de `ticket_approvals` para busca larga + filtro em JS traz mais linhas por execução horária** → mitigado pelo baixo volume esperado (aprovações pendentes são raras); sem necessidade de paginação.
- **[Trade-off] Comportamento muda de "fecha em N horas corridas" para "fecha em N dias úteis" sem flag de rollout** → é exatamente o comportamento pedido; não há necessidade de toggle, mas vale comunicar a analistas/gestores que o prazo de fechamento automático pode esticar até 2 dias corridos a mais em torno de fim de semana/feriado.

## Migration Plan

Sem migration de banco. Deploy é só troca de código:
1. Adicionar `addBusinessDays` em `sla.ts` + testes.
2. Atualizar os dois blocos do cron.
3. Deploy — próxima execução horária do cron já usa a regra nova, sem necessidade de backfill (o cálculo é sempre feito on-the-fly a partir de `updated_at`/`created_at` atuais).

Rollback: reverter o commit do cron (a função nova em `sla.ts` pode ficar sem uso, sem efeito colateral).
