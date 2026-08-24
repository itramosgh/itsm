## Why

Projeto ITSM ITRAMOS não tem README na raiz. Só existe `CLAUDE.md` (contexto pra IA, denso e técnico). Quem entra no repo pela primeira vez (dev novo, contratado, futuro eu) não tem onde começar: falta visão geral, setup local e onde cada peça mora.

## What Changes

- Criar `README.md` na raiz do projeto com:
  - O que é o sistema (ITSM B2B, público interno + portal cliente)
  - Stack (Next.js 16 App Router, Supabase, Resend)
  - Setup local (env vars, `npm run dev`, Supabase local)
  - Estrutura de rotas (route groups: internal/portal/auth/api)
  - Como rodar testes
  - Link pra `CLAUDE.md` pra detalhes de arquitetura profundos
- Não duplicar o conteúdo de `CLAUDE.md` — README é porta de entrada humana, `CLAUDE.md` continua sendo a referência técnica detalhada pra IA/dev experiente.

## Capabilities

Nenhuma. Documentação pura, não altera comportamento do sistema. `skip_specs: true` setado no `.openspec.yaml` deste change.

### New Capabilities
(nenhuma)

### Modified Capabilities
(nenhuma)

## Impact

- Novo arquivo: `README.md` (raiz)
- Nenhum código, schema ou API afetado
