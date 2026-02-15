-- Add mTLS support fields to endpoints table
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS mtls_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS client_cert_encrypted TEXT;
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS client_cert_iv TEXT;
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS client_key_encrypted TEXT;
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS client_key_iv TEXT;
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS ca_cert TEXT;

-- Index for mTLS enabled endpoints
CREATE INDEX IF NOT EXISTS idx_endpoints_mtls_enabled ON endpoints(mtls_enabled) WHERE mtls_enabled = true;

COMMENT ON COLUMN endpoints.mtls_enabled IS 'Whether mutual TLS is enabled for this endpoint';
COMMENT ON COLUMN endpoints.client_cert_encrypted IS 'PEM-encoded client certificate (encrypted)';
COMMENT ON COLUMN endpoints.client_cert_iv IS 'IV for client certificate encryption';
COMMENT ON COLUMN endpoints.client_key_encrypted IS 'PEM-encoded client private key (encrypted)';
COMMENT ON COLUMN endpoints.client_key_iv IS 'IV for client key encryption';
COMMENT ON COLUMN endpoints.ca_cert IS 'PEM-encoded CA certificate for server verification (optional)';
