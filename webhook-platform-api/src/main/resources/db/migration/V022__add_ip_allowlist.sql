-- V022: Add IP allowlist per endpoint
-- Description: Allows restricting webhook delivery to specific source IPs

-- Add allowed_source_ips to endpoints (comma-separated list or CIDR notation)
ALTER TABLE endpoints ADD COLUMN allowed_source_ips TEXT;

-- Comment: Format examples:
-- "192.168.1.1,10.0.0.0/8,172.16.0.0/12"
-- Empty/null means no restriction (allow all)
