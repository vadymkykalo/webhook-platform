-- ShedLock table for distributed task locking
CREATE TABLE IF NOT EXISTS shedlock (
    name VARCHAR(64) NOT NULL,
    lock_until TIMESTAMP NOT NULL,
    locked_at TIMESTAMP NOT NULL,
    locked_by VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);

CREATE INDEX IF NOT EXISTS idx_shedlock_lock_until ON shedlock(lock_until);

COMMENT ON TABLE shedlock IS 'Distributed lock table for scheduled tasks (prevents concurrent execution across API instances)';
