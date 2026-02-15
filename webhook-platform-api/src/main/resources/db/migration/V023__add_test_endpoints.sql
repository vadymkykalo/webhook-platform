-- V023: Add test endpoints (Request Bin) for webhook testing
-- Description: Temporary test endpoints to capture incoming webhook requests

-- Test endpoints table
CREATE TABLE IF NOT EXISTS test_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slug VARCHAR(12) NOT NULL UNIQUE,
    name VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0
);

-- Captured requests table
CREATE TABLE IF NOT EXISTS captured_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_endpoint_id UUID NOT NULL REFERENCES test_endpoints(id) ON DELETE CASCADE,
    method VARCHAR(10) NOT NULL,
    path VARCHAR(1024),
    query_string TEXT,
    headers TEXT,
    body TEXT,
    content_type VARCHAR(255),
    source_ip VARCHAR(45),
    user_agent VARCHAR(512),
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_test_endpoints_project ON test_endpoints(project_id);
CREATE INDEX IF NOT EXISTS idx_test_endpoints_slug ON test_endpoints(slug);
CREATE INDEX IF NOT EXISTS idx_test_endpoints_expires ON test_endpoints(expires_at);
CREATE INDEX IF NOT EXISTS idx_captured_requests_endpoint ON captured_requests(test_endpoint_id);
CREATE INDEX IF NOT EXISTS idx_captured_requests_received ON captured_requests(received_at DESC);
