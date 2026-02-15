-- V020: Add payload transformation template
-- Description: Allows custom payload transformation per subscription using JSON templates

-- Add payload_template to subscriptions
ALTER TABLE subscriptions ADD COLUMN payload_template TEXT;

-- Add payload_template to deliveries (copied from subscription at creation time)
ALTER TABLE deliveries ADD COLUMN payload_template TEXT;
