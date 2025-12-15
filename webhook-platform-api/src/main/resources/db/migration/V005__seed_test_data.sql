-- Test project
INSERT INTO projects (id, name, description, created_at, updated_at)
VALUES ('d7f8e9a0-1234-5678-9abc-def012345678', 'Test Project', 'Sample project for testing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Test API key (key: test_key_12345, hash of this key)
-- Actual key: test_key_12345
-- Hash (SHA-256 base64): qnR5htNz1D8pTNh8i8V3dJQzXhBL4l0RciOiCNFNLWo=
INSERT INTO api_keys (id, project_id, name, key_hash, key_prefix, created_at)
VALUES (
    'a1b2c3d4-5678-90ab-cdef-1234567890ab',
    'd7f8e9a0-1234-5678-9abc-def012345678',
    'Test API Key',
    'qnR5htNz1D8pTNh8i8V3dJQzXhBL4l0RciOiCNFNLWo=',
    'test_key',
    CURRENT_TIMESTAMP
);

-- Test endpoint (webhook.site or local test server)
-- Secret: test_secret_123
-- Encrypted with master key "development_master_key_32_chars"
INSERT INTO endpoints (id, project_id, url, description, secret_encrypted, secret_iv, enabled, created_at, updated_at)
VALUES (
    'e1f2a3b4-5678-90cd-ef12-3456789abcde',
    'd7f8e9a0-1234-5678-9abc-def012345678',
    'https://webhook.site/#!/view/your-unique-id',
    'Test webhook endpoint',
    'test_encrypted_secret',
    'test_iv',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Test subscription (subscribe to 'user.created' events)
INSERT INTO subscriptions (id, project_id, endpoint_id, event_type, enabled, created_at, updated_at)
VALUES (
    'a1b2c3d4-5678-90ab-cdef-123456789abc',
    'd7f8e9a0-1234-5678-9abc-def012345678',
    'e1f2a3b4-5678-90cd-ef12-3456789abcde',
    'user.created',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Another subscription for 'order.completed' events
INSERT INTO subscriptions (id, project_id, endpoint_id, event_type, enabled, created_at, updated_at)
VALUES (
    'b2c3d4e5-6789-01ab-cdef-234567890abc',
    'd7f8e9a0-1234-5678-9abc-def012345678',
    'e1f2a3b4-5678-90cd-ef12-3456789abcde',
    'order.completed',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
