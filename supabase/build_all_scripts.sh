#!/bin/bash
# Concatena os scripts 1 ao 5 em um único arquivo SQL.
# Uso: ./build_all_scripts.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="$SCRIPT_DIR/_all_config_db_scripts.sql"

scripts=(
  "1_rbac-migration.sql"
  "2_tuss-lookup-migration.sql"
  "3_correlacao-migration.sql"
  "4_rollback-migration.sql"
  "5_valores-tuss-migration.sql"
)

> "$OUTPUT"

for file in "${scripts[@]}"; do
  path="$SCRIPT_DIR/$file"
  if [ ! -f "$path" ]; then
    echo "❌ Arquivo não encontrado: $file"
    exit 1
  fi
  echo "-- ============================================================" >> "$OUTPUT"
  echo "-- ARQUIVO: $file"                                               >> "$OUTPUT"
  echo "-- ============================================================" >> "$OUTPUT"
  echo ""                                                                 >> "$OUTPUT"
  cat "$path"                                                             >> "$OUTPUT"
  echo ""                                                                 >> "$OUTPUT"
  echo ""                                                                 >> "$OUTPUT"
done

echo "✅ Gerado: $OUTPUT"
echo "   $(wc -l < "$OUTPUT") linhas"
