#!/bin/bash

IMAGE="tonanuvem/sisprime-multi-endoscopia-backend"
CONTAINER="sisprime-multi-endoscopia-backend"
PORTA="8802"

echo "Building Docker image with direct pip install..."
docker build -f Dockerfile -t $IMAGE  .

echo "Image size:"
docker images $IMAGE

echo "Starting container..."
docker run -d \
  --name $CONTAINER \
  -p $PORTA:8501 \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/outputs:/app/outputs \
  $IMAGE

echo "Running... porta: $PORTA"