# AGENTS.md

## Comunicação e fluxo de aprovação

- Antes de executar mudanças, descreva rapidamente quais telas, endpoints, módulos, serviços, queries e arquivos serão impactados.
- Em alterações com impacto funcional (regras de negócio, integrações, banco, autenticação), aguarde confirmação antes de aplicar.
- Priorize comunicação em pt-BR, objetiva e orientada a resultado.

## Segurança de arquivos e ambiente

- Nunca force alteração em arquivo somente leitura.
- Se houver bloqueio de permissão, pare e informe o arquivo afetado.
- Não exponha segredos em documentação, commits, logs ou exemplos (API keys, tokens, senhas, webhooks).

## Integridade de texto e configuração

- Preserve encoding existente dos arquivos ao editar.
- Evite mudanças desnecessárias de formatação em massa.
- Em `.md`, mantenha exemplos consistentes com os endpoints e payloads reais do projeto.

## Prioridades do projeto Hub Billing

- Plataforma multi-tenant para sistemas satélites: estabilidade e compatibilidade de contrato são prioridade.
- Idempotência, rastreabilidade e integridade financeira têm precedência sobre conveniência.
- Mudanças devem ser pequenas, previsíveis e fáceis de rollback.
- Evite refatorações amplas sem necessidade clara.

## Padrões técnicos (stack atual)

- Backend: NestJS + Fastify + PostgreSQL.
- Frontend: Next.js + React Query.
- Siga os padrões já existentes de módulo/controller/service/repository.
- Reutilize validações e DTOs existentes antes de criar novas estruturas.
- Preserve compatibilidade com APIs legadas de acesso quando aplicável.

## Regras de negócio críticas

- Contratos de integração para satélites são fonte de verdade.
- `amount` deve permanecer em centavos nos endpoints de cobrança/planos.
- Onboarding e webhooks devem ser idempotentes.
- Sincronização de pagamentos pendentes deve respeitar limite e throttling para não sobrecarregar gateway.

## Qualidade mínima antes de concluir

- Validar build dos pacotes afetados (`core` e/ou `web`) quando houver alteração de código.
- Confirmar que documentação e payloads reais estão alinhados.
- Informar riscos, limitações e próximos passos de forma objetiva.
