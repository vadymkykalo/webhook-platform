CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(255),
    payload JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_project_id ON events(project_id);
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE UNIQUE INDEX idx_events_idempotency_key ON events(project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url VARCHAR(2048) NOT NULL,
    description TEXT,
    secret_encrypted TEXT NOT NULL,
    secret_iv TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    rate_limit_per_second INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_endpoints_project_id ON endpoints(project_id);
CREATE INDEX idx_endpoints_enabled ON endpoints(enabled) WHERE enabled = true;
CREATE INDEX idx_endpoints_deleted_at ON endpoints(deleted_at) WHERE deleted_at IS NULL;
