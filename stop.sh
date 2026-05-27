#!/bin/bash

echo "Stopping services..."
docker-compose down

echo ""
echo "Removing images..."
docker-compose down --rmi all

echo ""
echo "Cleanup finished."
