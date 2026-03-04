package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Membership;
import com.webhook.platform.api.domain.entity.User;
import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.domain.enums.MembershipStatus;
import com.webhook.platform.api.domain.enums.UserStatus;
import com.webhook.platform.api.domain.repository.MembershipRepository;
import com.webhook.platform.api.domain.repository.UserRepository;
import com.webhook.platform.api.dto.AddMemberRequest;
import com.webhook.platform.api.dto.MemberResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
public class MembershipService {

    private static final int INVITE_EXPIRATION_HOURS = 48;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final MembershipRepository membershipRepository;
    private final EmailService emailService;
    private final BCryptPasswordEncoder passwordEncoder;

    public MembershipService(
            UserRepository userRepository,
            MembershipRepository membershipRepository,
            EmailService emailService) {
        this.userRepository = userRepository;
        this.membershipRepository = membershipRepository;
        this.emailService = emailService;
        this.passwordEncoder = new BCryptPasswordEncoder();
    }

    public List<MemberResponse> getOrganizationMembers(UUID organizationId) {
        List<Object[]> rows = membershipRepository.findMembersWithUsers(organizationId);

        return rows.stream()
                .map(row -> {
                    Membership membership = (Membership) row[0];
                    User user = (User) row[1];
                    return MemberResponse.builder()
                            .userId(user.getId())
                            .email(user.getEmail())
                            .role(membership.getRole())
                            .status(membership.getStatus())
                            .createdAt(membership.getCreatedAt())
                            .build();
                })
                .collect(Collectors.toList());
    }

    @Transactional
    public MemberResponse addMember(UUID organizationId, AddMemberRequest request, MembershipRole requestingRole) {
        if (requestingRole != MembershipRole.OWNER) {
            throw new ForbiddenException("Only owners can add members");
        }

        boolean isNewUser = !userRepository.existsByEmail(request.getEmail());

        User user = userRepository.findByEmail(request.getEmail())
                .orElseGet(() -> {
                    String tempPass = generateTemporaryPassword();
                    User newUser = User.builder()
                            .email(request.getEmail())
                            .passwordHash(passwordEncoder.encode(tempPass))
                            .status(UserStatus.ACTIVE)
                            .build();
                    User saved = userRepository.save(newUser);
                    // TODO: send temp password via email instead of logging
                    log.info("Created new user for invite: userId={}, email={}", saved.getId(), request.getEmail());
                    return saved;
                });

        if (membershipRepository.existsByUserIdAndOrganizationId(user.getId(), organizationId)) {
            throw new IllegalArgumentException("User is already a member");
        }

        String inviteToken = generateInviteToken();
        Instant expiresAt = Instant.now().plus(INVITE_EXPIRATION_HOURS, ChronoUnit.HOURS);

        Membership membership = Membership.builder()
                .userId(user.getId())
                .organizationId(organizationId)
                .role(request.getRole())
                .status(isNewUser ? MembershipStatus.INVITED : MembershipStatus.ACTIVE)
                .inviteToken(isNewUser ? inviteToken : null)
                .inviteExpiresAt(isNewUser ? expiresAt : null)
                .build();
        membershipRepository.save(membership);

        log.info("Member added: userId={}, orgId={}, role={}, status={}",
                user.getId(), organizationId, request.getRole(), membership.getStatus());

        if (isNewUser) {
            emailService.sendInviteEmail(request.getEmail(), organizationId.toString(), inviteToken);
        }

        return MemberResponse.builder()
                .userId(user.getId())
                .email(user.getEmail())
                .role(membership.getRole())
                .status(membership.getStatus())
                .createdAt(membership.getCreatedAt())
                .inviteToken(membership.getInviteToken())
                .build();
    }

    @Transactional
    public MemberResponse acceptInvite(String inviteToken, UUID organizationId, UUID authenticatedUserId) {
        Membership membership = membershipRepository.findByInviteToken(inviteToken)
                .orElseThrow(() -> new NotFoundException("Invalid or expired invite token"));

        // Security: validate the invite belongs to the specified organization AND the authenticated user.
        // Use a single generic error message to prevent information leakage about which check failed.
        boolean orgMatch = membership.getOrganizationId().equals(organizationId);
        boolean userMatch = membership.getUserId().equals(authenticatedUserId);
        if (!orgMatch || !userMatch) {
            log.warn("Invite token validation failed: orgMatch={}, userMatch={}, " +
                            "tokenOrgId={}, requestOrgId={}, tokenUserId={}, authUserId={}",
                    orgMatch, userMatch,
                    membership.getOrganizationId(), organizationId,
                    membership.getUserId(), authenticatedUserId);
            throw new ForbiddenException("Invalid invite token");
        }

        if (membership.getStatus() != MembershipStatus.INVITED) {
            throw new IllegalStateException("Invite already accepted or membership is not in INVITED status");
        }

        if (membership.getInviteExpiresAt() != null && Instant.now().isAfter(membership.getInviteExpiresAt())) {
            throw new ResponseStatusException(HttpStatus.GONE, "Invite token has expired");
        }

        membership.setStatus(MembershipStatus.ACTIVE);
        membership.setInviteToken(null);
        membership.setInviteExpiresAt(null);
        membershipRepository.save(membership);

        User user = userRepository.findById(membership.getUserId())
                .orElseThrow(() -> new NotFoundException("User not found"));

        log.info("Invite accepted: userId={}, orgId={}", user.getId(), membership.getOrganizationId());

        return MemberResponse.builder()
                .userId(user.getId())
                .email(user.getEmail())
                .role(membership.getRole())
                .status(membership.getStatus())
                .createdAt(membership.getCreatedAt())
                .build();
    }

    private String generateTemporaryPassword() {
        return "Temp" + UUID.randomUUID().toString().substring(0, 8) + "!";
    }

    private String generateInviteToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    @Transactional
    public MemberResponse changeMemberRole(UUID organizationId, UUID userId, MembershipRole newRole,
            MembershipRole requestingRole) {
        if (requestingRole != MembershipRole.OWNER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only owners can change member roles");
        }

        if (newRole == MembershipRole.OWNER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot assign OWNER role through this endpoint");
        }

        Membership membership = membershipRepository.findByUserIdAndOrganizationId(userId, organizationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Membership not found"));

        if (membership.getRole() == MembershipRole.OWNER) {
            long ownerCount = membershipRepository.countByOrganizationIdAndRole(organizationId, MembershipRole.OWNER);
            if (ownerCount <= 1) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot demote the last owner");
            }
        }

        membership.setRole(newRole);
        membershipRepository.save(membership);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        return MemberResponse.builder()
                .userId(user.getId())
                .email(user.getEmail())
                .role(membership.getRole())
                .status(membership.getStatus())
                .createdAt(membership.getCreatedAt())
                .build();
    }

    @Transactional
    public void removeMember(UUID organizationId, UUID userId, MembershipRole requestingRole) {
        if (requestingRole != MembershipRole.OWNER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only owners can remove members");
        }

        Membership membership = membershipRepository.findByUserIdAndOrganizationId(userId, organizationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Membership not found"));

        if (membership.getRole() == MembershipRole.OWNER) {
            long ownerCount = membershipRepository.countByOrganizationIdAndRole(organizationId, MembershipRole.OWNER);
            if (ownerCount <= 1) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot remove the last owner");
            }
        }

        membershipRepository.delete(membership);
    }
}
