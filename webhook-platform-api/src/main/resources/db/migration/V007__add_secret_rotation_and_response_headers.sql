-- Add secret rotation support to endpoints
ALTER TABLE endpoints ADD COLUMN secret_previous_encrypted TEXT;
ALTER TABLE endpoints ADD COLUMN secret_previous_iv TEXT;
ALTER TABLE endpoints ADD COLUMN secret_rotated_at TIMESTAMP;
ALTER TABLE endpoints ADD COLUMN secret_rotation_grace_period_hours INTEGER DEFAULT 24;

-- Add response headers storage to delivery_attempts
ALTER TABLE delivery_attempts ADD COLUMN response_headers JSONB;
