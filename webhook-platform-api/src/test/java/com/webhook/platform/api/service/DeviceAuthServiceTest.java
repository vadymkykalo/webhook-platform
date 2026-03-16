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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DeviceAuthServiceTest {

    @Mock
    private DeviceAuthCodeRepository deviceAuthCodeRepository;

    @Mock
    private MembershipRepository membershipRepository;

    @Mock
    private JwtUtil jwtUtil;

    @InjectMocks
    private DeviceAuthService deviceAuthService;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(deviceAuthService, "appBaseUrl", "http://localhost:5173");
    }

    @Test
    void shouldInitiateDeviceAuth() {
        when(deviceAuthCodeRepository.save(any(DeviceAuthCode.class)))
                .thenAnswer(inv -> {
                    DeviceAuthCode code = inv.getArgument(0);
                    code.setId(UUID.randomUUID());
                    return code;
                });

        DeviceCodeResponse response = deviceAuthService.initiateDeviceAuth();

        assertNotNull(response);
        assertNotNull(response.getDeviceCode());
        assertNotNull(response.getUserCode());
        assertTrue(response.getVerificationUrl().contains("localhost:5173"));
        assertTrue(response.getVerificationUrl().contains(response.getUserCode()));
        assertTrue(response.getExpiresInSeconds() > 0);
        assertTrue(response.getPollIntervalSeconds() > 0);
        assertNotNull(response.getExpiresAt());

        verify(deviceAuthCodeRepository).save(any(DeviceAuthCode.class));
    }

    @Test
    void shouldApproveDeviceCode() {
        UUID userId = UUID.randomUUID();
        UUID orgId = UUID.randomUUID();
        String userCode = "ABCD-1234";

        DeviceAuthCode code = DeviceAuthCode.builder()
                .id(UUID.randomUUID())
                .deviceCode("dev-code-123")
                .userCode(userCode)
                .status(DeviceAuthStatus.PENDING)
                .expiresAt(Instant.now().plus(5, ChronoUnit.MINUTES))
                .build();

        when(deviceAuthCodeRepository.findByUserCodeAndStatus(userCode, DeviceAuthStatus.PENDING))
                .thenReturn(Optional.of(code));
        when(deviceAuthCodeRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        deviceAuthService.approveDeviceCode(userCode, userId, orgId);

        ArgumentCaptor<DeviceAuthCode> captor = ArgumentCaptor.forClass(DeviceAuthCode.class);
        verify(deviceAuthCodeRepository).save(captor.capture());
        assertEquals(DeviceAuthStatus.APPROVED, captor.getValue().getStatus());
        assertEquals(userId, captor.getValue().getUserId());
        assertEquals(orgId, captor.getValue().getOrganizationId());
        assertNotNull(captor.getValue().getApprovedAt());
    }

    @Test
    void shouldThrowWhenApprovingNonexistentCode() {
        when(deviceAuthCodeRepository.findByUserCodeAndStatus("ZZZZ-9999", DeviceAuthStatus.PENDING))
                .thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () ->
                deviceAuthService.approveDeviceCode("ZZZZ-9999", UUID.randomUUID(), UUID.randomUUID()));
    }

    @Test
    void shouldThrowWhenApprovingExpiredCode() {
        String userCode = "EXPD-0001";
        DeviceAuthCode code = DeviceAuthCode.builder()
                .id(UUID.randomUUID())
                .userCode(userCode)
                .status(DeviceAuthStatus.PENDING)
                .expiresAt(Instant.now().minus(1, ChronoUnit.MINUTES))
                .build();

        when(deviceAuthCodeRepository.findByUserCodeAndStatus(userCode, DeviceAuthStatus.PENDING))
                .thenReturn(Optional.of(code));
        when(deviceAuthCodeRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertThrows(ResponseStatusException.class, () ->
                deviceAuthService.approveDeviceCode(userCode, UUID.randomUUID(), UUID.randomUUID()));
    }

    @Test
    void shouldReturnTokensWhenPollingApprovedCode() {
        UUID userId = UUID.randomUUID();
        UUID orgId = UUID.randomUUID();
        String deviceCode = "dev-approved";

        DeviceAuthCode code = DeviceAuthCode.builder()
                .id(UUID.randomUUID())
                .deviceCode(deviceCode)
                .userCode("APPR-0001")
                .status(DeviceAuthStatus.APPROVED)
                .userId(userId)
                .organizationId(orgId)
                .expiresAt(Instant.now().plus(5, ChronoUnit.MINUTES))
                .build();

        Membership membership = new Membership();
        membership.setRole(MembershipRole.OWNER);

        when(deviceAuthCodeRepository.findByDeviceCode(deviceCode)).thenReturn(Optional.of(code));
        when(membershipRepository.findByUserId(userId)).thenReturn(List.of(membership));
        when(jwtUtil.generateAccessToken(userId, orgId, MembershipRole.OWNER)).thenReturn("access-token-123");
        when(jwtUtil.generateRefreshToken(userId)).thenReturn("refresh-token-456");

        AuthResponse response = deviceAuthService.pollDeviceToken(deviceCode);

        assertNotNull(response);
        assertEquals("access-token-123", response.getAccessToken());
        assertEquals("refresh-token-456", response.getRefreshToken());
    }

    @Test
    void shouldThrow202WhenPollingPendingCode() {
        String deviceCode = "dev-pending";
        DeviceAuthCode code = DeviceAuthCode.builder()
                .id(UUID.randomUUID())
                .deviceCode(deviceCode)
                .status(DeviceAuthStatus.PENDING)
                .expiresAt(Instant.now().plus(5, ChronoUnit.MINUTES))
                .build();

        when(deviceAuthCodeRepository.findByDeviceCode(deviceCode)).thenReturn(Optional.of(code));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                deviceAuthService.pollDeviceToken(deviceCode));
        assertEquals(202, ex.getStatusCode().value());
    }

    @Test
    void shouldThrow410WhenPollingExpiredCode() {
        String deviceCode = "dev-expired";
        DeviceAuthCode code = DeviceAuthCode.builder()
                .id(UUID.randomUUID())
                .deviceCode(deviceCode)
                .status(DeviceAuthStatus.PENDING)
                .expiresAt(Instant.now().minus(1, ChronoUnit.MINUTES))
                .build();

        when(deviceAuthCodeRepository.findByDeviceCode(deviceCode)).thenReturn(Optional.of(code));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                deviceAuthService.pollDeviceToken(deviceCode));
        assertEquals(410, ex.getStatusCode().value());
    }
}
