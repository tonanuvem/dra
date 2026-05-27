#!/bin/bash

IP=$(curl -s checkip.amazonaws.com)
echo "Construindo e iniciando serviços com Docker Compose..."
docker compose up -d --build

echo ""
echo "Serviços em execução:"
echo "  Backend:  http://$IP:8802"
echo "  Frontend: http://$IP:3001"
echo ""
echo "Para ver logs: docker compose logs -f"
