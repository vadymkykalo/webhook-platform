-- Optimize cleanup queries
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_created_at ON delivery_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_delivery_attempt_number ON delivery_attempts(delivery_id, attempt_number DESC);

-- Add comments for documentation
COMMENT ON TABLE delivery_attempts IS 'Stores webhook delivery attempt details with request/response data. Retention: 90 days or last 10 attempts per delivery.';
COMMENT ON COLUMN delivery_attempts.request_body IS 'Request payload sent to endpoint (truncated at 100KB)';
COMMENT ON COLUMN delivery_attempts.response_body IS 'Response body from endpoint (truncated at 100KB)';
