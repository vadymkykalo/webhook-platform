package com.webhook.platform.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.Membership;
import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.domain.enums.MembershipStatus;
import com.webhook.platform.api.domain.repository.MembershipRepository;
import com.webhook.platform.api.dto.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Regression tests for P0 security fix: accept-invite must validate
 * both orgId (from path) and authenticated userId against the invite token.
 *
 * Strategy: register real users (each gets their own org + userId via JWT),
 * then create INVITED memberships directly via repository to control the
 * exact invite token, orgId, and userId.
 */
@AutoConfigureMockMvc
public class AcceptInviteSecurityTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MembershipRepository membershipRepository;

    private record UserContext(AuthResponse auth, CurrentUserResponse currentUser) {}

    private UserContext registerUser(String email, String orgName) throws Exception {
        RegisterRequest req = RegisterRequest.builder()
                .email(email)
                .password("Test1234!")
                .organizationName(orgName)
                .build();

        MvcResult regResult = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();

        AuthResponse auth = objectMapper.readValue(
                regResult.getResponse().getContentAsString(), AuthResponse.class);

        MvcResult meResult = mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + auth.getAccessToken()))
                .andExpect(status().isOk())
                .andReturn();

        CurrentUserResponse me = objectMapper.readValue(
                meResult.getResponse().getContentAsString(), CurrentUserResponse.class);

        return new UserContext(auth, me);
    }

    /**
     * Create an INVITED membership directly in DB with a known invite token.
     */
    private String createInvitedMembership(UUID userId, UUID orgId) {
        String inviteToken = "test-invite-" + UUID.randomUUID();
        Membership membership = Membership.builder()
                .userId(userId)
                .organizationId(orgId)
                .role(MembershipRole.DEVELOPER)
                .status(MembershipStatus.INVITED)
                .inviteToken(inviteToken)
                .inviteExpiresAt(Instant.now().plus(48, ChronoUnit.HOURS))
                .build();
        membershipRepository.saveAndFlush(membership);
        return inviteToken;
    }

    @Test
    public void testAcceptInvite_wrongUser_returns403() throws Exception {
        // Owner registers → creates OrgA
        UserContext owner = registerUser("sec-owner1@test.com", "SecOrg1");
        UUID orgId = owner.currentUser().getOrganization().getId();

        // Invitee registers → gets a userId
        UserContext invitee = registerUser("sec-invitee1@test.com", "InviteeOrg1");
        UUID inviteeUserId = invitee.currentUser().getUser().getId();

        // Create invite membership: invitee is invited to OrgA
        String inviteToken = createInvitedMembership(inviteeUserId, orgId);

        // Attacker: different user tries to accept
        UserContext attacker = registerUser("sec-attacker1@test.com", "AttackerOrg1");

        mockMvc.perform(post("/api/v1/orgs/" + orgId + "/members/accept-invite")
                        .param("token", inviteToken)
                        .header("Authorization", "Bearer " + attacker.auth().getAccessToken()))
                .andExpect(status().isForbidden());

        // Verify not compromised
        Membership m = membershipRepository.findByInviteToken(inviteToken).orElseThrow();
        assertEquals(MembershipStatus.INVITED, m.getStatus());
    }

    @Test
    public void testAcceptInvite_wrongOrgId_returns403() throws Exception {
        // Owner registers → creates OrgA
        UserContext owner = registerUser("sec-owner2@test.com", "SecOrg2");
        UUID orgId = owner.currentUser().getOrganization().getId();

        // Invitee registers → gets own OrgB
        UserContext invitee = registerUser("sec-invitee2@test.com", "InviteeOrg2");
        UUID inviteeUserId = invitee.currentUser().getUser().getId();
        UUID wrongOrgId = invitee.currentUser().getOrganization().getId();

        // Create invite: invitee invited to OrgA
        String inviteToken = createInvitedMembership(inviteeUserId, orgId);

        // Try to accept with wrong orgId (invitee's own org)
        mockMvc.perform(post("/api/v1/orgs/" + wrongOrgId + "/members/accept-invite")
                        .param("token", inviteToken)
                        .header("Authorization", "Bearer " + invitee.auth().getAccessToken()))
                .andExpect(status().isForbidden());

        // Verify not compromised
        Membership m = membershipRepository.findByInviteToken(inviteToken).orElseThrow();
        assertEquals(MembershipStatus.INVITED, m.getStatus());
    }

    @Test
    public void testAcceptInvite_fabricatedOrgId_returns403() throws Exception {
        UserContext owner = registerUser("sec-owner3@test.com", "SecOrg3");
        UUID orgId = owner.currentUser().getOrganization().getId();

        UserContext invitee = registerUser("sec-invitee3@test.com", "InviteeOrg3");
        UUID inviteeUserId = invitee.currentUser().getUser().getId();

        String inviteToken = createInvitedMembership(inviteeUserId, orgId);

        // Completely fabricated orgId
        mockMvc.perform(post("/api/v1/orgs/" + UUID.randomUUID() + "/members/accept-invite")
                        .param("token", inviteToken)
                        .header("Authorization", "Bearer " + invitee.auth().getAccessToken()))
                .andExpect(status().isForbidden());
    }

    @Test
    public void testAcceptInvite_correctUserAndOrg_returns200() throws Exception {
        UserContext owner = registerUser("sec-owner4@test.com", "SecOrg4");
        UUID orgId = owner.currentUser().getOrganization().getId();

        UserContext invitee = registerUser("sec-invitee4@test.com", "InviteeOrg4");
        UUID inviteeUserId = invitee.currentUser().getUser().getId();

        String inviteToken = createInvitedMembership(inviteeUserId, orgId);

        // Correct user + correct org → should succeed
        mockMvc.perform(post("/api/v1/orgs/" + orgId + "/members/accept-invite")
                        .param("token", inviteToken)
                        .header("Authorization", "Bearer " + invitee.auth().getAccessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.role").value("DEVELOPER"));

        // Token should be cleared after acceptance
        assertFalse(membershipRepository.findByInviteToken(inviteToken).isPresent(),
                "Invite token should be cleared after acceptance");
    }
}
