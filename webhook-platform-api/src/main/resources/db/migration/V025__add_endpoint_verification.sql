-- Add endpoint verification fields
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS verification_status VARCHAR(32) NOT NULL DEFAULT 'PENDING';
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS verification_token VARCHAR(64);
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS verification_attempted_at TIMESTAMP;
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS verification_completed_at TIMESTAMP;
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS verification_skip_reason VARCHAR(255);

-- Index for finding unverified endpoints
CREATE INDEX IF NOT EXISTS idx_endpoints_verification_status ON endpoints(verification_status);

-- Set existing endpoints as SKIPPED (legacy, trusted)
UPDATE endpoints SET verification_status = 'SKIPPED', verification_skip_reason = 'Legacy endpoint - created before verification' WHERE verification_status = 'PENDING';

COMMENT ON COLUMN endpoints.verification_status IS 'PENDING, VERIFIED, FAILED, SKIPPED';
COMMENT ON COLUMN endpoints.verification_token IS 'Random token sent in challenge request';
COMMENT ON COLUMN endpoints.verification_skip_reason IS 'Reason if verification was skipped by admin';
