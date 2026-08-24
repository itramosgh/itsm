## Why

Repo tem testes (Vitest) e nenhum CI rodando eles. Sem pipeline, regressão só aparece em produção. Também não há scan de vulnerabilidade em dependências/imagem — Trivy fecha essa lacuna.

## What Changes

- Cria workflow GitHub Actions (`.github/workflows/ci.yml`) disparado em push e pull_request para `main`.
- Job de testes unitários: instala deps, roda `npm run lint` e `npm run test` (Vitest).
- Job de segurança: roda Trivy (filesystem scan) sobre o repositório, falha o build em vulnerabilidades `CRITICAL`/`HIGH`.
- Jobs rodam em paralelo; PR só pode mergear com ambos verdes (branch protection é decisão manual do usuário, fora do escopo deste change).

## Capabilities

### New Capabilities
- `ci-pipeline`: pipeline GitHub Actions com testes unitários e scan de segurança Trivy

### Modified Capabilities
(nenhuma — capability nova, sem alteração de specs existentes)

## Impact

- Novo arquivo: `.github/workflows/ci.yml`
- Sem mudança em código de aplicação
- Requer testes existentes (`tests/`) passando sem depender de Supabase local rodando, OU pipeline precisa subir Supabase local (`npm run supabase:start`) antes dos testes — a decidir em design.md
