# ci-pipeline Specification

## Purpose

Garante que todo push e pull request para `main` roda testes unitários e scan de segurança Trivy automaticamente, bloqueando merge de código quebrado ou com vulnerabilidade crítica/alta não tratada.

## Requirements

### Requirement: Execução automática em push e pull request
O pipeline SHALL disparar automaticamente em todo push para `main` e em toda abertura/atualização de pull request contra `main`.

#### Scenario: Push direto para main
- **WHEN** um commit é enviado (push) para a branch `main`
- **THEN** o pipeline inicia execução dos jobs de teste e de segurança

#### Scenario: Pull request aberto ou atualizado
- **WHEN** um pull request é aberto ou recebe novos commits tendo `main` como base
- **THEN** o pipeline inicia execução dos jobs de teste e de segurança

### Requirement: Job de testes unitários
O pipeline SHALL executar lint e a suíte de testes automatizados do projeto, subindo o ambiente Supabase local necessário para os testes de integração, e SHALL falhar caso qualquer teste ou o lint falhe.

#### Scenario: Todos os testes passam
- **WHEN** lint e todos os testes da suíte executam sem erro
- **THEN** o job de testes é reportado como bem-sucedido

#### Scenario: Um teste falha
- **WHEN** qualquer teste da suíte falha, ou o lint reporta erro
- **THEN** o job de testes é reportado como falho e o pipeline não é considerado aprovado

### Requirement: Job de scan de segurança Trivy
O pipeline SHALL executar scan Trivy do sistema de arquivos do repositório e SHALL falhar quando encontrar vulnerabilidade de severidade CRITICAL ou HIGH sem supressão explícita.

#### Scenario: Nenhuma vulnerabilidade crítica/alta encontrada
- **WHEN** o scan Trivy não encontra vulnerabilidades CRITICAL ou HIGH não suprimidas
- **THEN** o job de segurança é reportado como bem-sucedido

#### Scenario: Vulnerabilidade crítica ou alta encontrada
- **WHEN** o scan Trivy encontra ao menos uma vulnerabilidade CRITICAL ou HIGH não suprimida
- **THEN** o job de segurança é reportado como falho e o pipeline não é considerado aprovado

### Requirement: Execução independente dos jobs
Os jobs de teste e de segurança SHALL executar em paralelo, de forma que a falha de um não impede a execução ou o relato de resultado do outro.

#### Scenario: Job de segurança falha, testes continuam
- **WHEN** o job de scan Trivy falha
- **THEN** o job de testes unitários continua executando e reporta seu próprio resultado normalmente
