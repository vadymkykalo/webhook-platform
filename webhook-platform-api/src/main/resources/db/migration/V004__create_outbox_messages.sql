CREATE TABLE outbox_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(255) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    kafka_topic VARCHAR(255) NOT NULL,
    kafka_key VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP
);

CREATE INDEX idx_outbox_messages_status ON outbox_messages(status);
CREATE INDEX idx_outbox_messages_created_at ON outbox_messages(created_at);
CREATE INDEX idx_outbox_messages_aggregate ON outbox_messages(aggregate_type, aggregate_id);
CREATE INDEX idx_outbox_messages_pending ON outbox_messages(created_at) WHERE status = 'PENDING';
