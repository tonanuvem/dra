#!/bin/bash

IMAGE="tonanuvem/sisprime-multi-endoscopia-frontend"
CONTAINER="sisprime-multi-endoscopia-frontend"
PORTA="3001"

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
