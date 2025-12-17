-- Add request context to delivery attempts for debugging
ALTER TABLE delivery_attempts 
ADD COLUMN request_headers JSONB,
ADD COLUMN request_body TEXT,
ADD COLUMN response_headers JSONB;

-- Add indexes for faster queries
CREATE INDEX idx_delivery_attempts_delivery_attempt ON delivery_attempts(delivery_id, attempt_number);
