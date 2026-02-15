-- V021: Add custom HTTP headers per subscription
-- Description: Allows custom headers to be added to webhook requests

-- Add custom_headers to subscriptions (JSON map: {"X-Custom-Header": "value"})
ALTER TABLE subscriptions ADD COLUMN custom_headers TEXT;

-- Add custom_headers to deliveries (copied from subscription at creation time)
ALTER TABLE deliveries ADD COLUMN custom_headers TEXT;
