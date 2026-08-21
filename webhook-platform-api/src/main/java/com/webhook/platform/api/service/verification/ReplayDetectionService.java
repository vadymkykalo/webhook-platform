package com.webhook.platform.api.service.verification;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;

/**
 * Redis-backed replay detection for incoming webhook signatures.
 * Caches seen signatures with 5-minute TTL to prevent replay attacks.
 */
@Service
@Slf4j
public class ReplayDetectionService {

    private static final String REDIS_KEY_PREFIX = "webhook:replay:";
    private static final Duration REPLAY_CACHE_TTL = Duration.ofMinutes(5);

    private final StringRedisTemplate redisTemplate;

    public ReplayDetectionService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * Check if this signature has been seen recently (replay attack).
     * If not seen, mark it as seen for the TTL window.
     *
     * @param sourceId unique identifier of the incoming source
     * @param signature the webhook signature to check
     * @return true if this is a replay (already seen), false if first time
     */
    public boolean isReplay(String sourceId, String signature) {
        String signatureHash = hashSignature(signature);
        String redisKey = REDIS_KEY_PREFIX + sourceId + ":" + signatureHash;

        Boolean wasSet = redisTemplate.opsForValue()
                .setIfAbsent(redisKey, "1", REPLAY_CACHE_TTL);

        if (Boolean.FALSE.equals(wasSet)) {
            log.warn("Replay attack detected: sourceId={}, signatureHash={}", sourceId, signatureHash);
            return true;
        }

        return false;
    }

    /**
     * Undo a previous {@link #isReplay} mark. isReplay marks a signature as seen the
     * moment it is first checked, before the caller has actually persisted anything for it. If
     * the write that was supposed to follow never commits (a validation failure downstream, an
     * unresolvable duplicate-key race, ...), the mark must not survive -- otherwise the
     * provider's legitimate re-send of the exact same webhook is rejected as a replay attack
     * for the rest of the TTL window and the event is lost for good instead of merely delayed.
     * Only call this for a signature this same request actually marked; never call it after a
     * successful commit.
     */
    public void unmark(String sourceId, String signature) {
        String signatureHash = hashSignature(signature);
        String redisKey = REDIS_KEY_PREFIX + sourceId + ":" + signatureHash;
        redisTemplate.delete(redisKey);
    }

    /**
     * Hash the signature to reduce Redis key size and prevent leaking raw signatures in logs.
     */
    private static String hashSignature(String signature) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(signature.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("Failed to hash signature for replay detection", e);
        }
    }
}
