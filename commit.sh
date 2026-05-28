#!/bin/bash

# Obter data e hora de São Paulo
DATA_HORA=$(TZ='America/Sao_Paulo' date '+%d/%m/%Y %H:%M:%S')

MENSAGEM="Atualização : versao Cargas BD Incrementais: correlacao_endoscopia - $DATA_HORA"

echo "Adicionando arquivos..."
git add .

echo "Criando commit..."
git commit -m "$MENSAGEM"

echo "Enviando para repositório remoto..."
git push

echo ""
echo "✅ Commit e push concluídos!"
echo "   Mensagem: $MENSAGEM"
