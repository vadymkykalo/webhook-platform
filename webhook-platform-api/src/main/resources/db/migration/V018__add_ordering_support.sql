-- V018: Add ordering support for FIFO delivery per endpoint
-- Description: Adds sequence_number to events and deliveries, ordering_enabled to subscriptions

-- Add sequence_number to events
ALTER TABLE events ADD COLUMN sequence_number BIGINT;

-- Add ordering fields to deliveries
ALTER TABLE deliveries ADD COLUMN sequence_number BIGINT;
ALTER TABLE deliveries ADD COLUMN ordering_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add ordering_enabled to subscriptions
ALTER TABLE subscriptions ADD COLUMN ordering_enabled BOOLEAN NOT NULL DEFAULT false;

-- Index for worker ordering queries (find pending deliveries by endpoint and sequence)
CREATE INDEX IF NOT EXISTS idx_deliveries_endpoint_seq 
ON deliveries (endpoint_id, sequence_number) 
WHERE status IN ('PENDING', 'PROCESSING');

-- Index for gap detection (find oldest pending delivery for a sequence)
CREATE INDEX IF NOT EXISTS idx_deliveries_endpoint_pending_seq
ON deliveries (endpoint_id, sequence_number, created_at)
WHERE status = 'PENDING' AND ordering_enabled = true;

-- Unique constraint for ordered deliveries (prevent duplicate sequences per endpoint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_endpoint_seq_unique
ON deliveries (endpoint_id, sequence_number)
WHERE ordering_enabled = true AND sequence_number IS NOT NULL;
