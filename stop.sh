#!/bin/bash

echo "Parando serviços..."
docker compose down

echo ""
echo "Removendo imagens..."
docker compose down --rmi all

echo ""
echo "Limpeza concluída."
