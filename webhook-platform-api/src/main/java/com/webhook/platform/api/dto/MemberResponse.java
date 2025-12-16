package com.webhook.platform.api.dto;

import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.domain.enums.MembershipStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MemberResponse {
    private UUID userId;
    private String email;
    private MembershipRole role;
    private MembershipStatus status;
    private Instant createdAt;
    private String temporaryPassword;
}
