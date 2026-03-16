package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.DeviceAuthCode;
import com.webhook.platform.api.domain.entity.Membership;
import com.webhook.platform.api.domain.enums.DeviceAuthStatus;
import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.domain.repository.DeviceAuthCodeRepository;
import com.webhook.platform.api.domain.repository.MembershipRepository;
import com.webhook.platform.api.dto.AuthResponse;
import com.webhook.platform.api.dto.DeviceCodeResponse;
import com.webhook.platform.api.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceAuthService {

    private final DeviceAuthCodeRepository deviceAuthCodeRepository;
    private final MembershipRepository membershipRepository;
    private final JwtUtil jwtUtil;

    @Value("${app.base-url:http://localhost:5173}")
    private String appBaseUrl;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int CODE_EXPIRY_MINUTES = 10;
    private static final int POLL_INTERVAL_SECONDS = 5;

    @Transactional
    public DeviceCodeResponse initiateDeviceAuth() {
        String deviceCode = generateDeviceCode();
        String userCode = generateUserCode();
        Instant expiresAt = Instant.now().plus(CODE_EXPIRY_MINUTES, ChronoUnit.MINUTES);

        DeviceAuthCode code = DeviceAuthCode.builder()
                .deviceCode(deviceCode)
                .userCode(userCode)
                .status(DeviceAuthStatus.PENDING)
                .expiresAt(expiresAt)
                .build();

        deviceAuthCodeRepository.save(code);
        log.info("Device auth initiated: userCode={}", userCode);

        return DeviceCodeResponse.builder()
                .deviceCode(deviceCode)
                .userCode(userCode)
                .verificationUrl(appBaseUrl + "/device?code=" + userCode)
                .expiresInSeconds(CODE_EXPIRY_MINUTES * 60)
                .pollIntervalSeconds(POLL_INTERVAL_SECONDS)
                .expiresAt(expiresAt)
                .build();
    }

    @Transactional
    public void approveDeviceCode(String userCode, UUID userId, UUID organizationId) {
        DeviceAuthCode code = deviceAuthCodeRepository.findByUserCodeAndStatus(userCode, DeviceAuthStatus.PENDING)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Device code not found or already used"));

        if (code.getExpiresAt().isBefore(Instant.now())) {
            code.setStatus(DeviceAuthStatus.EXPIRED);
            deviceAuthCodeRepository.save(code);
            throw new ResponseStatusException(HttpStatus.GONE, "Device code has expired");
        }

        code.setStatus(DeviceAuthStatus.APPROVED);
        code.setUserId(userId);
        code.setOrganizationId(organizationId);
        code.setApprovedAt(Instant.now());
        deviceAuthCodeRepository.save(code);

        log.info("Device auth approved: userCode={}, userId={}", userCode, userId);
    }

    @Transactional(readOnly = true)
    public AuthResponse pollDeviceToken(String deviceCode) {
        DeviceAuthCode code = deviceAuthCodeRepository.findByDeviceCode(deviceCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device code not found"));

        if (code.getExpiresAt().isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.GONE, "Device code has expired");
        }

        switch (code.getStatus()) {
            case PENDING:
                throw new ResponseStatusException(HttpStatus.ACCEPTED, "authorization_pending");
            case DENIED:
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Device authorization was denied");
            case EXPIRED:
                throw new ResponseStatusException(HttpStatus.GONE, "Device code has expired");
            case APPROVED:
                break;
        }

        Membership membership = membershipRepository.findByUserId(code.getUserId()).stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "No organization membership found"));

        String accessToken = jwtUtil.generateAccessToken(
                code.getUserId(), code.getOrganizationId(), membership.getRole());
        String refreshToken = jwtUtil.generateRefreshToken(code.getUserId());

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .build();
    }

    @Scheduled(fixedDelayString = "${device-auth.cleanup-interval-ms:300000}")
    @Transactional
    public void cleanupExpiredCodes() {
        int expired = deviceAuthCodeRepository.expireOldCodes(Instant.now());
        if (expired > 0) {
            log.debug("Expired {} device auth codes", expired);
        }
    }

    private String generateDeviceCode() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String generateUserCode() {
        // Human-readable 8-char alphanumeric code (easy to type)
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder sb = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            if (i == 4) sb.append('-');
            sb.append(chars.charAt(SECURE_RANDOM.nextInt(chars.length())));
        }
        return sb.toString();
    }
}
