-- Fix existing endpoints stuck at PENDING verification status
-- Change default to SKIPPED so endpoints work immediately
-- Verification is now opt-in for users who want extra SSRF protection
UPDATE endpoints SET verification_status = 'SKIPPED' WHERE verification_status = 'PENDING';

-- Also update the default in the column definition
ALTER TABLE endpoints ALTER COLUMN verification_status SET DEFAULT 'SKIPPED';
