package com.webhook.platform.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.User;
import com.webhook.platform.api.domain.repository.UserRepository;
import com.webhook.platform.api.dto.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
public class AuthIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Test
    public void testRegisterLoginAndGetCurrentUser() throws Exception {
        RegisterRequest registerRequest = RegisterRequest.builder()
                .email("test@example.com")
                .password("Test1234!")
                .organizationName("Test Company")
                .build();

        MvcResult registerResult = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken").exists())
                .andExpect(jsonPath("$.refreshToken").exists())
                .andExpect(jsonPath("$.emailVerified").value(false))
                .andReturn();

        AuthResponse authResponse = objectMapper.readValue(
                registerResult.getResponse().getContentAsString(),
                AuthResponse.class
        );

        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + authResponse.getAccessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("test@example.com"))
                .andExpect(jsonPath("$.user.status").value("PENDING_VERIFICATION"))
                .andExpect(jsonPath("$.organization.name").value("Test Company"))
                .andExpect(jsonPath("$.role").value("OWNER"));

        User user = userRepository.findByEmail("test@example.com").orElseThrow();
        String verificationToken = user.getVerificationToken();

        mockMvc.perform(post("/api/v1/auth/verify-email")
                        .param("token", verificationToken))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + authResponse.getAccessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.status").value("ACTIVE"));

        LoginRequest loginRequest = LoginRequest.builder()
                .email("test@example.com")
                .password("Test1234!")
                .build();

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").exists())
                .andExpect(jsonPath("$.refreshToken").exists())
                .andExpect(jsonPath("$.emailVerified").value(true));
    }

    @Test
    public void testLoginWithInvalidCredentials() throws Exception {
        LoginRequest loginRequest = LoginRequest.builder()
                .email("nonexistent@example.com")
                .password("WrongPass1!")
                .build();

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isUnauthorized());
    }
}
