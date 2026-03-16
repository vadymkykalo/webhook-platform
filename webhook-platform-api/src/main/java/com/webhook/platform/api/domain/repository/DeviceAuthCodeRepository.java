package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.DeviceAuthCode;
import com.webhook.platform.api.domain.enums.DeviceAuthStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DeviceAuthCodeRepository extends JpaRepository<DeviceAuthCode, UUID> {

    Optional<DeviceAuthCode> findByDeviceCode(String deviceCode);

    Optional<DeviceAuthCode> findByUserCode(String userCode);

    Optional<DeviceAuthCode> findByUserCodeAndStatus(String userCode, DeviceAuthStatus status);

    @Modifying
    @Query("UPDATE DeviceAuthCode d SET d.status = 'EXPIRED' WHERE d.status = 'PENDING' AND d.expiresAt < :now")
    int expireOldCodes(Instant now);
}
