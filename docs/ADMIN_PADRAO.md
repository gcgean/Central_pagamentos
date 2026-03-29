# Inicialização e Configuração do Administrador Padrão

Este documento descreve o funcionamento do sistema de criação automática do administrador principal (Master) no Hub Billing.

## Como funciona

Ao iniciar o backend (`@hub-billing/core`), o `AdminInitService` executa automaticamente durante a fase `OnModuleInit`.

O serviço realiza as seguintes etapas usando uma **Transação de Banco de Dados** (garantindo atomicidade e evitando concorrência):
1. Verifica se o e-mail `gcgean@hotmail.com` já existe na tabela `admins`.
2. Se não existir, gera o hash seguro da senha `csqwe123` utilizando **bcrypt** (salt 12).
3. Insere o administrador com a flag `must_change_password = true` e o papel `super_admin`.
4. Registra um evento imutável na tabela `audit_logs` sobre a criação do usuário.

## Primeiro Acesso

- **E-mail:** `gcgean@hotmail.com`
- **Senha temporária:** `csqwe123`

### Regras de Segurança Implementadas
- **Rate Limiting:** A rota de login `/api/v1/auth/login` está protegida com `@nestjs/throttler` (máximo de 5 tentativas por minuto por IP) para mitigar ataques de força bruta.
- **Troca de Senha Obrigatória:** Ao fazer o primeiro login, o sistema detecta a flag `must_change_password` e redireciona o usuário obrigatoriamente para a tela de troca de senha (`/change-password`). 
- **Bloqueio de API:** O `AdminJwtGuard` bloqueia (HTTP 403 Forbidden) qualquer tentativa de acesso aos endpoints do painel enquanto a senha não for trocada, exceto a própria rota de alteração de senha.
- **Política de Senha Forte:** A nova senha deve ter obrigatoriamente:
  - No mínimo 8 caracteres
  - Pelo menos 1 letra maiúscula
  - Pelo menos 1 letra minúscula
  - Pelo menos 1 número
  - Pelo menos 1 caractere especial

## Manutenção

Se precisar forçar a troca de senha novamente via banco de dados, você pode executar:

```sql
UPDATE admins SET must_change_password = true WHERE email = 'gcgean@hotmail.com';
```

Isso fará com que no próximo login o usuário seja obrigado a definir uma nova senha.
