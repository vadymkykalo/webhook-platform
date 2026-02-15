package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.AddMemberRequest;
import com.webhook.platform.api.dto.ChangeMemberRoleRequest;
import com.webhook.platform.api.dto.MemberResponse;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.service.MembershipService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v1/orgs/{orgId}/members")
@Tag(name = "Organizations", description = "Organization member management")
@SecurityRequirement(name = "bearerAuth")
public class MemberController {

    private final MembershipService membershipService;

    public MemberController(MembershipService membershipService) {
        this.membershipService = membershipService;
    }

    @Operation(summary = "List members", description = "Returns all members of the organization")
    @GetMapping
    public ResponseEntity<List<MemberResponse>> getMembers(
            @PathVariable("orgId") UUID orgId,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }

        List<MemberResponse> response = membershipService.getOrganizationMembers(orgId);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Add member", description = "Invites a user to the organization")
    @ApiResponse(responseCode = "201", description = "Member added")
    @PostMapping
    public ResponseEntity<MemberResponse> addMember(
            @PathVariable("orgId") UUID orgId,
            @Valid @RequestBody AddMemberRequest request,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        MemberResponse response = membershipService.addMember(
                orgId,
                request,
                jwtAuth.getRole()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "Change member role", description = "Updates a member's role (OWNER, ADMIN, MEMBER, VIEWER)")
    @PatchMapping("/{userId}")
    public ResponseEntity<MemberResponse> changeMemberRole(
            @PathVariable("orgId") UUID orgId,
            @PathVariable("userId") UUID userId,
            @Valid @RequestBody ChangeMemberRoleRequest request,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        MemberResponse response = membershipService.changeMemberRole(
                orgId,
                userId,
                request.getRole(),
                jwtAuth.getRole()
        );
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Remove member", description = "Removes a member from the organization")
    @ApiResponse(responseCode = "204", description = "Member removed")
    @DeleteMapping("/{userId}")
    public ResponseEntity<Void> removeMember(
            @PathVariable("orgId") UUID orgId,
            @PathVariable("userId") UUID userId,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        membershipService.removeMember(orgId, userId, jwtAuth.getRole());
        return ResponseEntity.noContent().build();
    }
}
