#!/bin/bash

KAFKA_CONTAINER="webhook-kafka"
BOOTSTRAP_SERVER="localhost:9092"

echo "Creating Kafka topics..."

topics=(
  "deliveries.dispatch"
  "deliveries.retry.1m"
  "deliveries.retry.5m"
  "deliveries.retry.15m"
  "deliveries.retry.1h"
  "deliveries.retry.6h"
  "deliveries.retry.24h"
  "deliveries.dlq"
)

for topic in "${topics[@]}"; do
  echo "Creating topic: $topic"
  docker exec $KAFKA_CONTAINER kafka-topics.sh \
    --create \
    --bootstrap-server $BOOTSTRAP_SERVER \
    --topic $topic \
    --partitions 3 \
    --replication-factor 1 \
    --if-not-exists
done

echo ""
echo "Listing all topics:"
docker exec $KAFKA_CONTAINER kafka-topics.sh \
  --list \
  --bootstrap-server $BOOTSTRAP_SERVER

echo ""
echo "Kafka topics created successfully!"
