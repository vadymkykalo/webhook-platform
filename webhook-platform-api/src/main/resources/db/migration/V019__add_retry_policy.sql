-- V019: Add configurable retry policy per subscription
-- Description: Allows custom retry configuration per subscription

-- Add retry policy fields to subscriptions
ALTER TABLE subscriptions ADD COLUMN max_attempts INTEGER DEFAULT 7;
ALTER TABLE subscriptions ADD COLUMN timeout_seconds INTEGER DEFAULT 30;
ALTER TABLE subscriptions ADD COLUMN retry_delays TEXT DEFAULT '60,300,900,3600,21600,86400';

-- Add retry policy fields to deliveries (copied from subscription at creation time)
ALTER TABLE deliveries ADD COLUMN timeout_seconds INTEGER DEFAULT 30;
ALTER TABLE deliveries ADD COLUMN retry_delays TEXT DEFAULT '60,300,900,3600,21600,86400';

-- Update existing subscriptions with defaults
UPDATE subscriptions SET max_attempts = 7 WHERE max_attempts IS NULL;
UPDATE subscriptions SET timeout_seconds = 30 WHERE timeout_seconds IS NULL;
UPDATE subscriptions SET retry_delays = '60,300,900,3600,21600,86400' WHERE retry_delays IS NULL;

-- Update existing deliveries with defaults
UPDATE deliveries SET timeout_seconds = 30 WHERE timeout_seconds IS NULL;
UPDATE deliveries SET retry_delays = '60,300,900,3600,21600,86400' WHERE retry_delays IS NULL;
