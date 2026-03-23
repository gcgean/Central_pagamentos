#!/bin/sh
# Script de inicialização do banco — executado pelo Docker na primeira vez
set -e

echo "→ Rodando migrations..."
for f in /docker-entrypoint-initdb.d/migrations/*.sql; do
  echo "  → $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

echo "→ Rodando seeds de desenvolvimento..."
for f in /docker-entrypoint-initdb.d/seeds/*.sql; do
  echo "  → $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

echo "✓ Banco inicializado com sucesso."
