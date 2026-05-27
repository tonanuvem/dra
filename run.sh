#!/bin/bash

echo "Building and starting services with Docker Compose..."
docker-compose up -d --build

echo ""
echo "Services running:"
echo "  Backend:  http://localhost:8802"
echo "  Frontend: http://localhost:3001"
echo ""
echo "To view logs: docker-compose logs -f"
