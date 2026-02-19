package com.webhook.platform.api.service;

import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RBucket;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Date;
import java.util.UUID;

@Service
@Slf4j
public class TokenBlacklistService {

    private static final String KEY_PREFIX = "jwt:blacklist:";
    private static final String EPOCH_PREFIX = "jwt:epoch:";

    private final RedissonClient redissonClient;

    public TokenBlacklistService(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    public void blacklist(String jti, Date expiration) {
        long ttlMs = expiration.getTime() - System.currentTimeMillis();
        if (ttlMs <= 0) {
            return;
        }

        RBucket<String> bucket = redissonClient.getBucket(KEY_PREFIX + jti);
        bucket.set("1", Duration.ofMillis(ttlMs));
        log.debug("Blacklisted token jti={} (TTL={}ms)", jti, ttlMs);
    }

    public boolean isBlacklisted(String jti) {
        if (jti == null) {
            return false;
        }
        RBucket<String> bucket = redissonClient.getBucket(KEY_PREFIX + jti);
        return bucket.isExists();
    }

    public void revokeAllUserTokens(UUID userId) {
        RBucket<Long> bucket = redissonClient.getBucket(EPOCH_PREFIX + userId);
        bucket.set(System.currentTimeMillis());
        log.info("Revoked all tokens for user {}", userId);
    }

    public boolean isTokenRevokedByEpoch(UUID userId, Date issuedAt) {
        if (userId == null || issuedAt == null) {
            return false;
        }
        RBucket<Long> bucket = redissonClient.getBucket(EPOCH_PREFIX + userId);
        Long epoch = bucket.get();
        return epoch != null && issuedAt.getTime() < epoch;
    }
}
