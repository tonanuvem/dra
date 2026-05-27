#!/bin/bash

IMAGE="tonanuvem/sisprime-multi-endoscopia-frontend"
CONTAINER="sisprime-multi-endoscopia-frontend"
PORTA="8801"

# Verificar se .env.local existe
if [ ! -f ".env.local" ]; then
  echo "❌ ERRO: Arquivo .env.local não encontrado!"
  echo ""
  echo "Por favor, crie o arquivo a partir do exemplo:"
  echo "  cp .env.example .env.local"
  echo ""
  echo "Depois edite o arquivo com suas credenciais do Supabase."
  exit 1
fi

echo "Building Docker image..."
docker build -f Dockerfile -t $IMAGE .

echo "Image size:"
docker images $IMAGE

echo "Starting container..."
docker run -d \
  --name $CONTAINER \
  -p $PORTA:3000 \
  $IMAGE

echo "Running... porta: $PORTA"
