package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.AuthResponse;
import com.webhook.platform.api.dto.CurrentUserResponse;
import com.webhook.platform.api.dto.LoginRequest;
import com.webhook.platform.api.dto.RefreshTokenRequest;
import com.webhook.platform.api.dto.RegisterRequest;
import com.webhook.platform.api.exception.UnauthorizedException;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.service.AuthRateLimiterService;
import com.webhook.platform.api.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Slf4j
@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication", description = "User registration and login")
public class AuthController {

    private final AuthService authService;
    private final AuthRateLimiterService authRateLimiterService;

    public AuthController(AuthService authService, AuthRateLimiterService authRateLimiterService) {
        this.authService = authService;
        this.authRateLimiterService = authRateLimiterService;
    }

    @Operation(summary = "Register new user", description = "Creates a new user account and organization")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "User registered successfully"),
            @ApiResponse(responseCode = "400", description = "Invalid request or email already exists")
    })
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request,
                                                  HttpServletRequest httpRequest) {
        if (!authRateLimiterService.allowRegister(getClientIp(httpRequest))) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many registration attempts. Try again later.");
        }
        try {
            AuthResponse response = authService.register(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            log.error("Registration failed: {}", e.getMessage(), e);
            throw e;
        }
    }

    @Operation(summary = "Login", description = "Authenticates user and returns JWT token")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Login successful"),
            @ApiResponse(responseCode = "401", description = "Invalid credentials")
    })
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request,
                                               HttpServletRequest httpRequest) {
        if (!authRateLimiterService.allowLogin(getClientIp(httpRequest), request.getEmail())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many login attempts. Try again later.");
        }
        try {
            AuthResponse response = authService.login(request);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Login failed: {}", e.getMessage());
            throw e;
        }
    }

    @Operation(summary = "Refresh token", description = "Exchanges a valid refresh token for new access and refresh tokens")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Tokens refreshed successfully"),
            @ApiResponse(responseCode = "401", description = "Invalid or expired refresh token")
    })
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refreshToken(@Valid @RequestBody RefreshTokenRequest request,
                                                      HttpServletRequest httpRequest) {
        if (!authRateLimiterService.allowLogin(getClientIp(httpRequest), null)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Try again later.");
        }
        try {
            AuthResponse response = authService.refreshToken(request.getRefreshToken());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Token refresh failed: {}", e.getMessage());
            throw e;
        }
    }

    @Operation(summary = "Get current user", description = "Returns information about the authenticated user")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "User info returned"),
            @ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/me")
    public ResponseEntity<CurrentUserResponse> getCurrentUser(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        CurrentUserResponse response = authService.getCurrentUser(
                jwtAuth.getUserId(),
                jwtAuth.getOrganizationId(),
                jwtAuth.getRole()
        );
        return ResponseEntity.ok(response);
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
