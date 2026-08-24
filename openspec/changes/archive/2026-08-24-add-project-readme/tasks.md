## 1. Levantamento de conteúdo

- [x] 1.1 Ler `CLAUDE.md`, `package.json` e estrutura de `src/app/` e verificar lista de route groups, stack e scripts npm coletada
- [x] 1.2 Verificar env vars obrigatórias (`.env.example` ou seção "Key env vars" do `CLAUDE.md`) e confirmar lista completa

## 2. Escrever README.md

- [x] 2.1 Escrever seção de visão geral (o que é o sistema, quem usa) e verificar que não duplica texto do `CLAUDE.md`
- [x] 2.2 Escrever seção de stack e arquitetura de alto nível (route groups, Supabase clients) e verificar contra `CLAUDE.md`
- [x] 2.3 Escrever seção de setup local (env vars, `npm run dev`, `npm run supabase:start`) e verificar que os comandos existem em `package.json`
- [x] 2.4 Escrever seção de testes (`npm run test`, exemplo de arquivo único) e verificar comando roda localmente
- [x] 2.5 Adicionar link pra `CLAUDE.md` como referência técnica detalhada

## 3. Validação final

- [x] 3.1 Revisar `README.md` renderizado (markdown preview) e verificar headings, links e blocos de código formatados corretamente
- [x] 3.2 Confirmar que nenhum código do projeto foi alterado, apenas o novo arquivo `README.md` foi adicionado
