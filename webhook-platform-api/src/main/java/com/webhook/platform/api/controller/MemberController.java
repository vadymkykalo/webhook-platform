package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.AddMemberRequest;
import com.webhook.platform.api.dto.ChangeMemberRoleRequest;
import com.webhook.platform.api.dto.MemberResponse;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.security.RequireOrgAccess;
import com.webhook.platform.api.service.MembershipService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v1/orgs/{orgId}/members")
@Tag(name = "Organizations", description = "Organization member management")
@SecurityRequirement(name = "bearerAuth")
@SecurityRequirement(name = "apiKey")
public class MemberController {

    private final MembershipService membershipService;

    public MemberController(MembershipService membershipService) {
        this.membershipService = membershipService;
    }

    @Operation(summary = "List members", description = "Returns all members of the organization")
    @RequireOrgAccess
    @GetMapping
    public ResponseEntity<List<MemberResponse>> getMembers(
            @PathVariable("orgId") UUID orgId,
            AuthContext auth) {
        List<MemberResponse> response = membershipService.getOrganizationMembers(orgId);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Add member", description = "Invites a user to the organization")
    @ApiResponse(responseCode = "201", description = "Member added")
    @RequireOrgAccess
    @PostMapping
    public ResponseEntity<MemberResponse> addMember(
            @PathVariable("orgId") UUID orgId,
            @Valid @RequestBody AddMemberRequest request,
            AuthContext auth) {
        MemberResponse response = membershipService.addMember(
                orgId,
                request,
                auth.role());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "Change member role", description = "Updates a member's role (OWNER, ADMIN, MEMBER, VIEWER)")
    @RequireOrgAccess
    @PatchMapping("/{userId}")
    public ResponseEntity<MemberResponse> changeMemberRole(
            @PathVariable("orgId") UUID orgId,
            @PathVariable("userId") UUID userId,
            @Valid @RequestBody ChangeMemberRoleRequest request,
            AuthContext auth) {
        MemberResponse response = membershipService.changeMemberRole(
                orgId,
                userId,
                request.getRole(),
                auth.role());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Remove member", description = "Removes a member from the organization")
    @ApiResponse(responseCode = "204", description = "Member removed")
    @RequireOrgAccess
    @DeleteMapping("/{userId}")
    public ResponseEntity<Void> removeMember(
            @PathVariable("orgId") UUID orgId,
            @PathVariable("userId") UUID userId,
            AuthContext auth) {
        membershipService.removeMember(orgId, userId, auth.role());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Accept invite", description = "Accepts an organization membership invite using the invite token")
    @ApiResponse(responseCode = "200", description = "Invite accepted")
    @PostMapping("/accept-invite")
    public ResponseEntity<MemberResponse> acceptInvite(
            @PathVariable("orgId") UUID orgId,
            @RequestParam("token") String token,
            AuthContext auth) {
        MemberResponse response = membershipService.acceptInvite(token, orgId, auth.requireUserId());
        return ResponseEntity.ok(response);
    }
}
