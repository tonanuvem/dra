#!/bin/bash

# Verificar se .env existe na raiz do projeto
if [ ! -f "./.env" ]; then
  echo "❌ ERRO: Arquivo .env não encontrado!"
  echo ""
  echo "Por favor, crie o arquivo a partir do exemplo:"
  echo "  cp .env.example .env"
  echo ""
  echo "Depois edite o arquivo com suas credenciais do Supabase."
  exit 1
fi

IP=$(curl -s checkip.amazonaws.com)
echo "Construindo e iniciando serviços com Docker Compose..."
docker compose up -d --build

echo ""
echo "Serviços em execução:"
echo "  Backend:  http://$IP:8802"
echo "  Frontend: http://$IP:8801"
echo ""
echo "Para ver logs: docker compose logs -f"
