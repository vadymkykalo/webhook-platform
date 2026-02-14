#!/bin/bash

set -e

echo "=========================================="
echo "Webhook Platform - Setup"
echo "=========================================="
echo ""

# Build
echo "Building project..."
mvn clean package -DskipTests -q
echo " Build complete"
echo ""

# Start services
echo "Starting services..."
docker-compose down -v
docker-compose up -d
echo " Services started"
echo ""

# Wait for services
echo "Waiting for services to be ready..."
sleep 30

# Create Kafka topics
echo "Creating Kafka topics..."
bash scripts/create-kafka-topics.sh
echo ""

echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Services:"
echo "  - API:    http://localhost:8080"
echo "  - Worker: http://localhost:8081 (management)"
echo ""
echo "Health checks:"
echo "  curl http://localhost:8080/actuator/health"
echo "  curl http://localhost:8081/actuator/health"
echo ""
echo "Run E2E test:"
echo "  bash scripts/e2e-test.sh"
echo ""
