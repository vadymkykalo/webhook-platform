package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.AuthResponse;
import com.webhook.platform.api.dto.CurrentUserResponse;
import com.webhook.platform.api.dto.LoginRequest;
import com.webhook.platform.api.dto.RegisterRequest;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.service.AuthService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@RequestBody RegisterRequest request) {
        try {
            AuthResponse response = authService.register(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            log.error("Registration failed: {}", e.getMessage(), e);
            throw e;
        }
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody LoginRequest request) {
        try {
            AuthResponse response = authService.login(request);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Login failed: {}", e.getMessage());
            throw e;
        }
    }

    @GetMapping("/me")
    public ResponseEntity<CurrentUserResponse> getCurrentUser(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        CurrentUserResponse response = authService.getCurrentUser(
                jwtAuth.getUserId(),
                jwtAuth.getOrganizationId(),
                jwtAuth.getRole()
        );
        return ResponseEntity.ok(response);
    }
}
