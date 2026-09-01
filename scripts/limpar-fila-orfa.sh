#!/usr/bin/env bash
#
# Limpa o estado quebrado das filas BullMQ no Redis de produção.
#
# CAUSA RAIZ (corrigida em código — veja shared/queue/queue.module.ts)
# --------------------------------------------------------------------
# A conexão do BullMQ usava `keyPrefix` do ioredis, que o BullMQ NÃO suporta.
# Comandos comuns (LPUSH na lista `active`, por exemplo) saíam prefixados com
# "hub_billing:", mas os scripts Lua do BullMQ montam os nomes de chave por
# conta própria e gravavam SEM o prefixo. Resultado:
#
#   hub_billing:bull:internal-events:active  -> tem os ids dos jobs
#   bull:internal-events:<id>                -> tem os dados dos jobs
#
# O worker lê um id da lista `active`, o script Lua procura os dados no
# caminho prefixado, não acha, e repete "Missing key for job N" para sempre —
# ~100 erros por segundo, com a API a 180% de CPU.
#
# Depois da correção o BullMQ passa a usar a opção `prefix` dele, e tudo vive
# num namespace só: hub_billing:<fila>:*
#
# ESTE SCRIPT remove os DOIS namespaces antigos, que ficaram inservíveis.
# Rode-o DEPOIS de subir a correção.
#
# O QUE SE PERDE
# --------------
# Os jobs presos em `active` são descartados. Isso é aceitável porque:
#   - internal-events: todos os eventos correspondentes estão delivered = true
#     no Postgres (conferido). O trabalho foi feito; só a contabilidade no
#     Redis ficou quebrada.
#   - Qualquer evento realmente pendente é reenfileirado pelo cron horário a
#     partir do banco, que é a fonte da verdade.
#   - webhook-processing tinha 345 jobs presos. Confira depois se algum webhook
#     precisa ser reprocessado — o script mostra a contagem antes de apagar.
#
# USO
#   ./limpar-fila-orfa.sh           # simulação: mostra o que faria
#   ./limpar-fila-orfa.sh --apply   # apaga de verdade
#
set -euo pipefail

REDIS_CONTAINER="hub_billing_redis_prod"
APLICAR="${1:-}"

rc() { docker exec "$REDIS_CONTAINER" redis-cli "$@"; }

echo "== Limpeza de filas BullMQ | container: $REDIS_CONTAINER =="
echo

# ── 1. Fotografa o estado atual ──────────────────────────────────────────────
echo "-- Estado atual --"
for q in internal-events webhook-processing license-expiry notifications; do
  a="$(rc LLEN "hub_billing:bull:$q:active" | tr -d '\r')"
  w="$(rc LLEN "hub_billing:bull:$q:wait" | tr -d '\r')"
  echo "  $q: active=$a wait=$w"
done
echo
echo -n "  chaves 'bull:*' (namespace órfão dos dados)      -> "; rc --scan --pattern 'bull:*' 2>/dev/null | wc -l | tr -d ' '
echo -n "  chaves 'hub_billing:bull:*' (namespace da fila)  -> "; rc --scan --pattern 'hub_billing:bull:*' 2>/dev/null | wc -l | tr -d ' '
echo -n "  total no Redis                                   -> "; rc DBSIZE | tr -d '\r'
echo

# ── 2. Confirma que a correção já subiu ──────────────────────────────────────
# Sem ela, limpar não adianta: o split de namespace recria tudo.
echo "-- Verificando se a correção está rodando --"
if docker exec hub_billing_api_prod sh -c "grep -q 'keyPrefix' dist/shared/queue/queue.module.js" 2>/dev/null; then
  echo "  ABORTADO: o container ainda tem 'keyPrefix' no queue.module compilado."
  echo "  Suba a correção primeiro, senão o problema volta na hora:"
  echo "    cd /srv/sites/pagamentos/app && git pull origin main \\"
  echo "      && docker compose -f docker-compose.prod.yml --env-file .env.production build api \\"
  echo "      && docker compose -f docker-compose.prod.yml --env-file .env.production --profile localdb up -d --force-recreate api"
  exit 1
fi
echo "  ok: 'keyPrefix' não está mais no código compilado"
echo

# ── 3. Confere eventos pendentes no banco ────────────────────────────────────
echo "-- Eventos internos pendentes no banco --"
PENDENTES="$(docker exec hub_billing_postgres_prod sh -c \
  'psql -U $POSTGRES_USER -d $POSTGRES_DB -t -A -c "SELECT COUNT(*) FROM internal_events WHERE delivered = false"' \
  2>/dev/null | tr -d '\r' || echo "?")"
echo "  não entregues: $PENDENTES  (o cron horário reenfileira estes)"
echo

if [ "$APLICAR" != "--apply" ]; then
  echo "SIMULAÇÃO — nada foi apagado."
  echo "Para aplicar de verdade:  $0 --apply"
  exit 0
fi

# ── 4. Remove os dois namespaces antigos ─────────────────────────────────────
# UNLINK (não DEL) para não travar o Redis, que atende o sistema de pagamentos.
echo "-- Removendo namespaces antigos --"
for padrao in 'bull:*' 'hub_billing:bull:*'; do
  rc --scan --pattern "$padrao" > /tmp/rm.txt 2>/dev/null || true
  n="$(wc -l < /tmp/rm.txt | tr -d ' ')"
  echo "  $padrao -> $n chaves"
  if [ "$n" != "0" ]; then
    rm -f /tmp/lote_*
    split -l 200 /tmp/rm.txt /tmp/lote_
    for arquivo in /tmp/lote_*; do
      # shellcheck disable=SC2046
      rc UNLINK $(tr '\n' ' ' < "$arquivo") > /dev/null
    done
    rm -f /tmp/lote_*
  fi
done
rm -f /tmp/rm.txt
echo

# ── 5. Resultado ─────────────────────────────────────────────────────────────
echo "-- Depois --"
echo -n "  bull:*             -> "; rc --scan --pattern 'bull:*' 2>/dev/null | wc -l | tr -d ' '
echo -n "  hub_billing:bull:* -> "; rc --scan --pattern 'hub_billing:bull:*' 2>/dev/null | wc -l | tr -d ' '
echo -n "  total no Redis     -> "; rc DBSIZE | tr -d '\r'
echo
echo "Reinicie a API para o worker largar as referências em memória:"
echo "  docker restart hub_billing_api_prod"
echo
echo "Depois confira (deve ser 0):"
echo "  docker logs hub_billing_api_prod --since 60s 2>&1 | grep -c 'Missing key'"
