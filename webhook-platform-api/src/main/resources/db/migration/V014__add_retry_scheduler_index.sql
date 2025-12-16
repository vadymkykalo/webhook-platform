-- Optimize retry scheduler query: WHERE status = 'PENDING' AND next_retry_at <= now ORDER BY next_retry_at
-- Composite index supports both filtering and sorting efficiently
CREATE INDEX idx_deliveries_retry_query ON deliveries(status, next_retry_at) 
    WHERE next_retry_at IS NOT NULL;

-- This partial index includes only rows with scheduled retries, reducing index size
-- Query plan: Index Scan using idx_deliveries_retry_query
-- Expected speedup: O(n) -> O(log n + k) where k = result rows
