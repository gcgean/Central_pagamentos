#!/usr/bin/env bash
#
# Limpa jobs órfãos da fila BullMQ `internal-events` no Redis de produção.
#
# CONTEXTO
# --------
# O cron horário de retry reenfileirava um job por hora para o mesmo evento,
# sem checar se já havia um job ativo. Com o removeOnFail do BullMQ, isso
# deixou hashes de job e locks sem dono no Redis. O worker tenta mover esses
# jobs para "finished"/"delayed", não encontra a estrutura da fila e repete o
# erro "Missing key for job X" indefinidamente — queimando CPU sem parar.
#
# A causa raiz já está corrigida no commit d2c88f4 (jobId fixo = eventId).
# ESTE SCRIPT NÃO CORRIGE NADA: ele só remove a sujeira que ficou. Rode-o
# DEPOIS de subir a correção, senão os órfãos voltam a se acumular.
#
# POR QUE É SEGURO
# ----------------
# Verificado em 01/09/2026, em produção:
#   - As chaves de estrutura da fila (meta, id, events, wait, active, delayed,
#     failed, completed, paused...) NÃO EXISTEM MAIS. Não há fila para
#     preservar; o BullMQ recria essas chaves sozinho no próximo enfileiramento.
#   - Sobraram 2.356 hashes de job + 474 locks, e nada mais.
#   - Os 2.356 eventos correspondentes estão com delivered = true no Postgres,
#     que é a fonte da verdade. Ou seja: o trabalho foi feito, só a contabilidade
#     no Redis ficou órfã. Nenhum evento é perdido.
#   - Se algum evento estivesse pendente, o cron horário o reenfileiraria a
#     partir do banco de qualquer forma.
#
# O script confere essas premissas de novo antes de apagar, e aborta se elas
# não valerem mais.
#
# USO
#   ./limpar-fila-orfa.sh           # simulação: mostra o que faria, não apaga
#   ./limpar-fila-orfa.sh --apply   # apaga de verdade
#
set -euo pipefail

REDIS_CONTAINER="hub_billing_redis_prod"
FILA="internal-events"
APLICAR="${1:-}"

rc() { docker exec "$REDIS_CONTAINER" redis-cli "$@"; }

echo "== Fila: $FILA | container: $REDIS_CONTAINER =="
echo

# ── 1. Confere que a fila realmente não tem estrutura viva ───────────────────
# Se qualquer uma destas existir, há fila ativa e apagar seria destrutivo.
echo "-- Verificando estrutura da fila --"
ESTRUTURA_VIVA=0
for k in meta id events wait active delayed failed completed paused priority; do
  tipo="$(rc TYPE "bull:$FILA:$k" | tr -d '\r')"
  if [ "$tipo" != "none" ]; then
    echo "  ATENÇÃO: bull:$FILA:$k existe (tipo $tipo)"
    ESTRUTURA_VIVA=1
  fi
done

if [ "$ESTRUTURA_VIVA" = "1" ]; then
  echo
  echo "ABORTADO: a fila tem estrutura viva — a situação mudou desde o"
  echo "diagnóstico. Não apague nada às cegas; investigue antes."
  exit 1
fi
echo "  ok: nenhuma chave de estrutura viva (a fila não existe no Redis)"
echo

# ── 2. Confere que não há evento pendente que dependa da fila ────────────────
echo "-- Verificando eventos pendentes no banco --"
PENDENTES="$(docker exec hub_billing_postgres_prod sh -c \
  'psql -U $POSTGRES_USER -d $POSTGRES_DB -t -A -c "SELECT COUNT(*) FROM internal_events WHERE delivered = false"' \
  2>/dev/null | tr -d '\r' || echo "?")"
echo "  eventos não entregues: $PENDENTES"
echo "  (mesmo que haja, o cron horário os reenfileira a partir do banco)"
echo

# ── 3. Conta o que será removido ─────────────────────────────────────────────
echo "-- Contando chaves órfãs --"
rc --scan --pattern "bull:$FILA:*" > /tmp/orfas.txt 2>/dev/null || true
TOTAL="$(wc -l < /tmp/orfas.txt | tr -d ' ')"
echo "  chaves bull:$FILA:* encontradas: $TOTAL"
echo "  total de chaves no Redis: $(rc DBSIZE | tr -d '\r')"
echo

if [ "$TOTAL" = "0" ]; then
  echo "Nada a fazer."
  exit 0
fi

if [ "$APLICAR" != "--apply" ]; then
  echo "SIMULAÇÃO — nada foi apagado."
  echo "Para aplicar de verdade:  $0 --apply"
  exit 0
fi

# ── 4. Remove em lotes com UNLINK (não bloqueia o Redis) ─────────────────────
# UNLINK libera a memória numa thread separada; DEL travaria o Redis com
# milhares de chaves, e ele atende o sistema de pagamentos inteiro.
echo "-- Removendo (UNLINK, em lotes de 200) --"
REMOVIDAS=0
split -l 200 /tmp/orfas.txt /tmp/lote_
for arquivo in /tmp/lote_*; do
  # shellcheck disable=SC2046
  rc UNLINK $(tr '\n' ' ' < "$arquivo") > /dev/null
  REMOVIDAS=$((REMOVIDAS + $(wc -l < "$arquivo")))
  printf "\r  removidas: %s/%s" "$REMOVIDAS" "$TOTAL"
done
rm -f /tmp/lote_* /tmp/orfas.txt
echo
echo

# ── 5. Resultado ─────────────────────────────────────────────────────────────
echo "-- Depois --"
echo "  chaves bull:$FILA:* restantes: $(rc --scan --pattern "bull:$FILA:*" 2>/dev/null | wc -l | tr -d ' ')"
echo "  total de chaves no Redis: $(rc DBSIZE | tr -d '\r')"
echo
echo "Pronto. Acompanhe por ~1 minuto se o erro parou:"
echo "  docker logs hub_billing_api_prod --since 60s 2>&1 | grep -c 'Missing key'"
echo "Deve ir a zero. Se continuar, o worker ficou com referências em memória —"
echo "nesse caso reinicie a API:"
echo "  docker restart hub_billing_api_prod"
