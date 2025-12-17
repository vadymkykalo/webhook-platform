#!/bin/bash

KAFKA_CONTAINER="${KAFKA_CONTAINER:-webhook-kafka}"
BOOTSTRAP_SERVER="${KAFKA_BOOTSTRAP_SERVER:-localhost:9092}"
REPLICATION_FACTOR="${KAFKA_REPLICATION_FACTOR:-1}"
PARTITIONS="${KAFKA_PARTITIONS:-3}"
MIN_ISR="${KAFKA_MIN_ISR:-1}"

echo "Creating Kafka topics with replication-factor=$REPLICATION_FACTOR, partitions=$PARTITIONS, min.insync.replicas=$MIN_ISR"

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
  docker exec $KAFKA_CONTAINER /opt/kafka/bin/kafka-topics.sh \
    --create \
    --bootstrap-server $BOOTSTRAP_SERVER \
    --topic $topic \
    --partitions $PARTITIONS \
    --replication-factor $REPLICATION_FACTOR \
    --config min.insync.replicas=$MIN_ISR \
    --config retention.ms=604800000 \
    --if-not-exists
done

echo ""
echo "Listing all topics:"
docker exec $KAFKA_CONTAINER /opt/kafka/bin/kafka-topics.sh \
  --list \
  --bootstrap-server $BOOTSTRAP_SERVER

echo ""
echo "Topic details:"
for topic in "${topics[@]}"; do
  docker exec $KAFKA_CONTAINER /opt/kafka/bin/kafka-topics.sh \
    --describe \
    --bootstrap-server $BOOTSTRAP_SERVER \
    --topic $topic
done

echo ""
echo "Kafka topics created successfully!"
echo "WARNING: For production, use KAFKA_REPLICATION_FACTOR=3 and KAFKA_MIN_ISR=2"
