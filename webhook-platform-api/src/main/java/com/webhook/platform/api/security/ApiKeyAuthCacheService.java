package com.webhook.platform.api.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.webhook.platform.api.domain.entity.ApiKey;
import com.webhook.platform.api.domain.repository.ApiKeyRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;

/**
 * Caffeine-backed cache for API key authentication lookups.
 * Avoids a DB round-trip on every SDK request.
 *
 * <ul>
 *   <li>TTL: 60 seconds — short enough that revocations propagate quickly</li>
 *   <li>Max size: 10 000 entries — bounded memory</li>
 *   <li>Explicit eviction on revoke for immediate invalidation</li>
 * </ul>
 */
@Service
@Slf4j
public class ApiKeyAuthCacheService {

    private final ApiKeyRepository apiKeyRepository;

    // Cache: keyHash → Optional<ApiKey>
    // We cache Optional to also cache "not found" lookups (negative caching)
    private final Cache<String, Optional<ApiKey>> cache;

    public ApiKeyAuthCacheService(ApiKeyRepository apiKeyRepository) {
        this.apiKeyRepository = apiKeyRepository;
        this.cache = Caffeine.newBuilder()
                .maximumSize(10_000)
                .expireAfterWrite(Duration.ofSeconds(60))
                .recordStats()
                .build();
    }

    /**
     * Look up an API key by its hash, using cache.
     */
    public Optional<ApiKey> findByKeyHash(String keyHash) {
        return cache.get(keyHash, k -> apiKeyRepository.findByKeyHash(k));
    }

    /**
     * Evict a specific key hash from cache (call on revoke).
     */
    public void evict(String keyHash) {
        cache.invalidate(keyHash);
        log.debug("Evicted API key cache entry for hash prefix: {}...", keyHash.substring(0, Math.min(8, keyHash.length())));
    }

    /**
     * Evict all cached entries (e.g. bulk key rotation).
     */
    public void evictAll() {
        cache.invalidateAll();
        log.info("Evicted all API key cache entries");
    }
}
