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
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class MembershipService {

    private final UserRepository userRepository;
    private final MembershipRepository membershipRepository;
    private final BCryptPasswordEncoder passwordEncoder;

    public MembershipService(
            UserRepository userRepository,
            MembershipRepository membershipRepository) {
        this.userRepository = userRepository;
        this.membershipRepository = membershipRepository;
        this.passwordEncoder = new BCryptPasswordEncoder();
    }

    public List<MemberResponse> getOrganizationMembers(UUID organizationId) {
        List<Membership> memberships = membershipRepository.findByOrganizationId(organizationId);
        
        return memberships.stream()
                .map(membership -> {
                    User user = userRepository.findById(membership.getUserId())
                            .orElseThrow(() -> new NotFoundException("User not found"));
                    return MemberResponse.builder()
                            .userId(user.getId())
                            .email(user.getEmail())
                            .role(membership.getRole())
                            .status(MembershipStatus.ACTIVE)
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

        String temporaryPassword = null;
        boolean isNewUser = !userRepository.existsByEmail(request.getEmail());
        
        User user = userRepository.findByEmail(request.getEmail())
                .orElseGet(() -> {
                    String tempPass = generateTemporaryPassword();
                    User newUser = User.builder()
                            .email(request.getEmail())
                            .passwordHash(passwordEncoder.encode(tempPass))
                            .status(UserStatus.ACTIVE)
                            .build();
                    return userRepository.save(newUser);
                });

        if (membershipRepository.existsByUserIdAndOrganizationId(user.getId(), organizationId)) {
            throw new IllegalArgumentException("User is already a member");
        }

        if (isNewUser) {
            temporaryPassword = generateTemporaryPassword();
            user.setPasswordHash(passwordEncoder.encode(temporaryPassword));
            userRepository.save(user);
        }

        Membership membership = Membership.builder()
                .userId(user.getId())
                .organizationId(organizationId)
                .role(request.getRole())
                .build();
        membershipRepository.save(membership);

        return MemberResponse.builder()
                .userId(user.getId())
                .email(user.getEmail())
                .role(membership.getRole())
                .status(MembershipStatus.ACTIVE)
                .createdAt(membership.getCreatedAt())
                .temporaryPassword(temporaryPassword)
                .build();
    }

    private String generateTemporaryPassword() {
        return "Temp" + UUID.randomUUID().toString().substring(0, 8) + "!";
    }

    @Transactional
    public MemberResponse changeMemberRole(UUID organizationId, UUID userId, MembershipRole newRole, MembershipRole requestingRole) {
        if (requestingRole != MembershipRole.OWNER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only owners can change member roles");
        }

        if (newRole == MembershipRole.OWNER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot assign OWNER role through this endpoint");
        }

        Membership membership = membershipRepository.findByUserIdAndOrganizationId(userId, organizationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Membership not found"));

        if (membership.getRole() == MembershipRole.OWNER) {
            long ownerCount = membershipRepository.findByOrganizationId(organizationId).stream()
                    .filter(m -> m.getRole() == MembershipRole.OWNER)
                    .count();
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
                .status(MembershipStatus.ACTIVE)
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
            long ownerCount = membershipRepository.findByOrganizationId(organizationId).stream()
                    .filter(m -> m.getRole() == MembershipRole.OWNER)
                    .count();
            if (ownerCount <= 1) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot remove the last owner");
            }
        }

        membershipRepository.delete(membership);
    }
}
