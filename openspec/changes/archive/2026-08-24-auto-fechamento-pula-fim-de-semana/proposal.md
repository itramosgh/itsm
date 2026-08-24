## Why

O cron `ticket-automations` fecha chamados em `aguardando_cliente` após 48h corridas e expira aprovações pendentes (`aguardando_aprovacao`) após 48h corridas, sem considerar fim de semana ou feriado. Um chamado colocado em espera na sexta-feira é fechado no domingo, sem o cliente ter tido um dia útil real para responder.

## What Changes

- Novo helper `addBusinessDays` em `src/lib/sla.ts`: soma horas a uma data pulando dias não-úteis (fim de semana + feriado), contando 24h corridas nos dias úteis (não limita a janela de expediente, diferente de `addBusinessHours`).
- Dias úteis derivados de `platform_settings.business_hours_days` (mesma config já usada pelo SLA) — não hardcoded.
- Feriados da tabela `holidays` entram no cálculo, igual ao motor de SLA.
- `aguardando_cliente`: lembrete (24h) e fechamento automático (48h) passam a usar `addBusinessDays` em vez de diff cru de horas, **exceto** para chamados de contrato `is_24x7 = true`, que mantêm a contagem corrida atual.
- `aguardando_aprovacao`: mesmo ajuste — expiração de aprovação (48h) pula fim de semana/feriado, exceto contrato 24x7. Query perde o prefiltro exato de data no SQL (deadline agora varia por contrato/feriado) e passa a filtrar em JS após buscar candidatos com uma janela larga.
- Chamado sem `contract_id` (sem contrato vinculado) é tratado como não-24x7 (aplica o pulo).

## Capabilities

### New Capabilities
- `chamados/fechamento-automatico`: regras de auto-fechamento e lembrete para chamados em `aguardando_cliente` e expiração de `aguardando_aprovacao`, incluindo como o tempo de espera é contado (corrido vs. dias úteis, exceção 24x7).

### Modified Capabilities
(nenhuma — capability nova, comportamento de SLA em `src/lib/sla.ts` não muda, só ganha função auxiliar nova)

## Impact

- `src/lib/sla.ts` — nova função exportada `addBusinessDays`.
- `src/app/api/cron/ticket-automations/route.ts` — lógica dos blocos `aguardando_cliente` e `aguardando_aprovacao`.
- `tests/sla.test.ts` — novos casos de teste para `addBusinessDays`.
- Sem migration — reusa `platform_settings.business_hours_days` e `holidays` já existentes.
