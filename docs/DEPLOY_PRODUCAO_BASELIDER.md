# Deploy em Produção — pagamentos.baselider.com.br

Este guia prepara o Hub Billing para rodar em servidor Linux com Nginx já utilizado por outros sistemas.

## 1) Pré-requisitos do servidor

- Docker e Docker Compose instalados
- Nginx instalado
- Certbot (Let's Encrypt) instalado
- DNS `pagamentos.baselider.com.br` apontando para o IP do servidor
- Portas 80 e 443 liberadas no firewall

## 2) Publicar o projeto

No servidor:

```bash
cd /opt
git clone <repo> central_pagamentos
cd central_pagamentos
cp .env.production.example .env.production
```

Edite `.env.production` com segredos reais.

Obrigatórios:
- `DATABASE_URL` (PostgreSQL externo recomendado)
- `JWT_SECRET`
- `MERCADOPAGO_ACCESS_TOKEN` ou `ASAAS_API_KEY` (conforme gateway ativo)

Exemplo de `DATABASE_URL`:

```text
postgresql://hub_billing:SENHA_FORTE@154.53.48.79:5436/hub_billing
```

Se quiser usar Postgres local no mesmo compose, suba com profile:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production --profile localdb up -d --build
```

## 3) Subir containers de produção

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Verificação:

```bash
docker ps
curl -sS http://127.0.0.1:3005/api/health
curl -I http://127.0.0.1:3004
```

## 4) Configurar Nginx no domínio

Copie o arquivo de referência:

```bash
sudo cp deploy/nginx/pagamentos.baselider.com.br.conf /etc/nginx/sites-available/pagamentos.baselider.com.br.conf
sudo ln -s /etc/nginx/sites-available/pagamentos.baselider.com.br.conf /etc/nginx/sites-enabled/pagamentos.baselider.com.br.conf
```

Teste e recarregue:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5) Emitir SSL

```bash
sudo certbot --nginx -d pagamentos.baselider.com.br
```

Teste:

```bash
curl -I https://pagamentos.baselider.com.br
```

## 6) Configurações críticas pós-deploy

No painel do Hub Billing:
- Configurar gateway (Access Token e Public Key do Mercado Pago)
- Configurar webhook secret do gateway
- Validar conectividade no menu Configurações

No painel do gateway:
- Webhook Mercado Pago:
  - `https://pagamentos.baselider.com.br/api/v1/webhooks/gateway/mercadopago`
- Webhook Asaas:
  - `https://pagamentos.baselider.com.br/api/v1/webhooks/gateway/asaas`

## 7) Regras para cartão em produção

Tokenização de cartão exige HTTPS. O domínio já precisa estar com SSL válido.

Sem HTTPS, o MercadoPago.js bloqueia com erro de conexão segura.

## 8) Rotina de atualização

```bash
cd /opt/central_pagamentos
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## 9) Checklist final de go-live

- Healthcheck da API retorna `status: ok`
- Login admin funcionando
- Criação de pedido e checkout PIX funcionando
- Checkout cartão funcionando em HTTPS
- Webhooks chegando no Hub
- Webhooks de saída chegando no sistema satélite
- Logs sem erro crítico (`docker logs`)
