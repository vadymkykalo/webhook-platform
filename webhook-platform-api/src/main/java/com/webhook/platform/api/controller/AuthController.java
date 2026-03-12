package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.AuthResponse;
import com.webhook.platform.api.dto.ChangePasswordRequest;
import com.webhook.platform.api.dto.CurrentUserResponse;
import com.webhook.platform.api.dto.ForgotPasswordRequest;
import com.webhook.platform.api.dto.LoginRequest;
import com.webhook.platform.api.dto.LogoutRequest;
import com.webhook.platform.api.dto.RefreshTokenRequest;
import com.webhook.platform.api.dto.RegisterRequest;
import com.webhook.platform.api.dto.ResetPasswordRequest;
import com.webhook.platform.api.dto.UpdateProfileRequest;
import com.webhook.platform.api.dto.UserResponse;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.service.AuthRateLimiterService;
import com.webhook.platform.api.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Slf4j
@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication", description = "User registration and login")
public class AuthController {

    private final AuthService authService;
    private final AuthRateLimiterService authRateLimiterService;
    private final boolean isProduction;

    public AuthController(
            AuthService authService,
            AuthRateLimiterService authRateLimiterService,
            @Value("${app.env:development}") String appEnv) {
        this.authService = authService;
        this.authRateLimiterService = authRateLimiterService;
        this.isProduction = "production".equalsIgnoreCase(appEnv);
    }

    @Operation(summary = "Register new user", description = "Creates a new user account and organization")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "User registered successfully"),
            @ApiResponse(responseCode = "400", description = "Invalid request or email already exists")
    })
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        if (!authRateLimiterService.allowRegister(getClientIp(httpRequest))) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many registration attempts. Try again later.");
        }
        try {
            AuthResponse response = authService.register(request);
            setRefreshTokenCookie(httpResponse, response.getRefreshToken());
            response.setRefreshToken(null);
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
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        if (!authRateLimiterService.allowLogin(getClientIp(httpRequest), request.getEmail())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many login attempts. Try again later.");
        }
        try {
            AuthResponse response = authService.login(request);
            setRefreshTokenCookie(httpResponse, response.getRefreshToken());
            response.setRefreshToken(null);
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
    public ResponseEntity<AuthResponse> refreshToken(@CookieValue(value = "refresh_token", required = false) String cookieRefreshToken,
            @RequestBody(required = false) RefreshTokenRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        if (!authRateLimiterService.allowLogin(getClientIp(httpRequest), null)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Try again later.");
        }
        try {
            String refreshToken = cookieRefreshToken != null ? cookieRefreshToken : 
                (request != null ? request.getRefreshToken() : null);
            if (refreshToken == null) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token missing");
            }
            AuthResponse response = authService.refreshToken(refreshToken);
            setRefreshTokenCookie(httpResponse, response.getRefreshToken());
            response.setRefreshToken(null);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Token refresh failed: {}", e.getMessage());
            throw e;
        }
    }

    @Operation(summary = "Logout", description = "Revokes access and refresh tokens")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Logged out successfully"),
            @ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestBody(required = false) LogoutRequest request,
            HttpServletRequest httpRequest) {
        String authHeader = httpRequest.getHeader("Authorization");
        String accessToken = (authHeader != null && authHeader.startsWith("Bearer "))
                ? authHeader.substring(7)
                : null;
        String refreshToken = (request != null) ? request.getRefreshToken() : null;

        authService.logout(accessToken, refreshToken);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Verify email", description = "Verifies user email with the token sent to their email")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Email verified successfully"),
            @ApiResponse(responseCode = "400", description = "Invalid or expired token")
    })
    @PostMapping("/verify-email")
    public ResponseEntity<Void> verifyEmail(@RequestParam("token") String token) {
        authService.verifyEmail(token);
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "Resend verification email", description = "Sends a new verification email to the user")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Verification email sent"),
            @ApiResponse(responseCode = "400", description = "Email already verified"),
            @ApiResponse(responseCode = "404", description = "User not found"),
            @ApiResponse(responseCode = "429", description = "Too many requests")
    })
    @PostMapping("/resend-verification")
    public ResponseEntity<Void> resendVerification(@RequestParam("email") String email,
            HttpServletRequest httpRequest) {
        if (!authRateLimiterService.allowLogin(getClientIp(httpRequest), email)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Try again later.");
        }
        authService.resendVerification(email);
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "Change password", description = "Changes the authenticated user's password")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Password changed successfully"),
            @ApiResponse(responseCode = "400", description = "Current password incorrect or validation failed"),
            @ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping("/change-password")
    public ResponseEntity<Void> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            AuthContext auth) {
        authService.changePassword(auth.requireUserId(), request.getCurrentPassword(), request.getNewPassword());
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "Update profile", description = "Updates the authenticated user's profile information")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Profile updated successfully"),
            @ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PutMapping("/profile")
    public ResponseEntity<UserResponse> updateProfile(
            @Valid @RequestBody UpdateProfileRequest request,
            AuthContext auth) {
        UserResponse response = authService.updateProfile(auth.requireUserId(), request);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Get current user", description = "Returns information about the authenticated user")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "User info returned"),
            @ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/me")
    public ResponseEntity<CurrentUserResponse> getCurrentUser(AuthContext auth) {
        CurrentUserResponse response = authService.getCurrentUser(
                auth.requireUserId(),
                auth.organizationId(),
                auth.role());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Forgot password", description = "Sends a password reset email to the user")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "If the email exists, a reset link has been sent"),
            @ApiResponse(responseCode = "429", description = "Too many requests")
    })
    @PostMapping("/forgot-password")
    public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request,
            HttpServletRequest httpRequest) {
        if (!authRateLimiterService.allowLogin(getClientIp(httpRequest), request.getEmail())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many requests. Try again later.");
        }
        authService.forgotPassword(request.getEmail());
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "Reset password", description = "Resets user password using the token from the reset email")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Password reset successfully"),
            @ApiResponse(responseCode = "400", description = "Invalid or expired token")
    })
    @PostMapping("/reset-password")
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request,
            HttpServletRequest httpRequest) {
        if (!authRateLimiterService.allowLogin(getClientIp(httpRequest), null)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many requests. Try again later.");
        }
        authService.resetPassword(request.getToken(), request.getNewPassword());
        return ResponseEntity.ok().build();
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private void setRefreshTokenCookie(HttpServletResponse response, String refreshToken) {
        Cookie cookie = new Cookie("refresh_token", refreshToken);
        cookie.setHttpOnly(true);
        cookie.setSecure(isProduction); // HTTPS only in production, allow HTTP for localhost dev
        cookie.setPath("/api/v1/auth");
        cookie.setMaxAge(7 * 24 * 60 * 60); // 7 days
        cookie.setAttribute("SameSite", isProduction ? "Strict" : "Lax"); // Lax for dev cross-origin
        response.addCookie(cookie);
    }
}
