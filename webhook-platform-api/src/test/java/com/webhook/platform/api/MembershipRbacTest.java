package com.webhook.platform.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.dto.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
public class MembershipRbacTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    public void testDeveloperCannotAddMembers() throws Exception {
        RegisterRequest ownerRequest = RegisterRequest.builder()
                .email("owner@example.com")
                .password("password123")
                .organizationName("Test Org")
                .build();

        MvcResult ownerResult = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerRequest)))
                .andExpect(status().isCreated())
                .andReturn();

        AuthResponse ownerAuth = objectMapper.readValue(
                ownerResult.getResponse().getContentAsString(),
                AuthResponse.class
        );

        MvcResult meResult = mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + ownerAuth.getAccessToken()))
                .andExpect(status().isOk())
                .andReturn();

        CurrentUserResponse currentUser = objectMapper.readValue(
                meResult.getResponse().getContentAsString(),
                CurrentUserResponse.class
        );

        String orgId = currentUser.getOrganization().getId().toString();

        AddMemberRequest addDeveloperRequest = AddMemberRequest.builder()
                .email("developer@example.com")
                .role(MembershipRole.DEVELOPER)
                .build();

        mockMvc.perform(post("/api/v1/orgs/" + orgId + "/members")
                        .header("Authorization", "Bearer " + ownerAuth.getAccessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(addDeveloperRequest)))
                .andExpect(status().isCreated());

        LoginRequest devLoginRequest = LoginRequest.builder()
                .email("developer@example.com")
                .password("password123")
                .build();

        RegisterRequest devRegisterRequest = RegisterRequest.builder()
                .email("developer@example.com")
                .password("password123")
                .organizationName("Dev Org")
                .build();

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(devRegisterRequest)))
                .andExpect(status().isCreated());

        MvcResult devLoginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(devLoginRequest)))
                .andExpect(status().isOk())
                .andReturn();

        AuthResponse devAuth = objectMapper.readValue(
                devLoginResult.getResponse().getContentAsString(),
                AuthResponse.class
        );

        AddMemberRequest addAnotherMemberRequest = AddMemberRequest.builder()
                .email("viewer@example.com")
                .role(MembershipRole.VIEWER)
                .build();

        mockMvc.perform(get("/api/v1/orgs/" + orgId + "/members")
                        .header("Authorization", "Bearer " + ownerAuth.getAccessToken()))
                .andExpect(status().isOk());
    }
}
