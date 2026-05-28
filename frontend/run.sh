#!/bin/bash

IMAGE="tonanuvem/sisprime-multi-endoscopia-frontend"
CONTAINER="sisprime-multi-endoscopia-frontend"
PORTA="8801"

# Verificar se o .env raiz do projeto existe
if [ ! -f "../.env" ]; then
  echo "❌ ERRO: Arquivo ../.env não encontrado!"
  echo ""
  echo "Por favor, crie o arquivo a partir do exemplo:"
  echo "  cp ../.env.example ../.env"
  echo ""
  echo "Depois edite o arquivo com suas credenciais do Supabase."
  exit 1
fi

# Carregar variáveis do .env raiz
set -a
source "../.env"
set +a

echo "Building Docker image..."
docker build -f Dockerfile \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  -t $IMAGE .

echo "Image size:"
docker images $IMAGE

echo "Starting container..."
docker run -d \
  --name $CONTAINER \
  -p $PORTA:3000 \
  --env-file "../.env" \
  $IMAGE

echo "Running... porta: $PORTA"
