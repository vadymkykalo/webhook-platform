package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.AuthResponse;
import com.webhook.platform.api.dto.DeviceApproveRequest;
import com.webhook.platform.api.dto.DeviceCodeResponse;
import com.webhook.platform.api.dto.DeviceTokenRequest;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.security.TrustedProxyResolver;
import com.webhook.platform.api.service.AuthRateLimiterService;
import com.webhook.platform.api.service.DeviceAuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/auth/device")
@Tag(name = "Device Authentication", description = "Device code flow for CLI authentication")
@RequiredArgsConstructor
public class DeviceAuthController {

    private final DeviceAuthService deviceAuthService;
    private final AuthRateLimiterService authRateLimiterService;
    private final TrustedProxyResolver trustedProxyResolver;

    @Operation(summary = "Initiate device auth",
            description = "Generates a device code and user code for CLI login. " +
                    "The user code should be displayed to the user to enter in the browser.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Device code generated"),
    })
    @PostMapping("/code")
    public ResponseEntity<DeviceCodeResponse> initiateDeviceAuth() {
        DeviceCodeResponse response = deviceAuthService.initiateDeviceAuth();
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Poll for device token",
            description = "CLI polls this endpoint with device_code until the user approves. " +
                    "Returns 202 while pending, 200 with tokens when approved.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Authorization granted, tokens returned"),
            @ApiResponse(responseCode = "202", description = "Authorization pending"),
            @ApiResponse(responseCode = "403", description = "Authorization denied"),
            @ApiResponse(responseCode = "410", description = "Code expired"),
    })
    @PostMapping("/token")
    public ResponseEntity<AuthResponse> pollDeviceToken(@Valid @RequestBody DeviceTokenRequest request,
            HttpServletRequest httpRequest) {
        // This endpoint is permitAll (no session yet) and the device_code is presented
        // by an unauthenticated caller, so it is a brute-force target within the code's
        // expiry window. Bucket by IP and by the presented device_code itself, reusing
        // the same limiter as refresh/reset-password rather than a parallel one.
        if (!authRateLimiterService.allowTokenAction(getClientIp(httpRequest), request.getDeviceCode())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Try again later.");
        }
        AuthResponse response = deviceAuthService.pollDeviceToken(request.getDeviceCode());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Approve device code",
            description = "Called by the authenticated user in the browser to approve a device login request")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Device code approved"),
            @ApiResponse(responseCode = "404", description = "Code not found or already used"),
            @ApiResponse(responseCode = "410", description = "Code expired"),
    })
    @PostMapping("/approve")
    public ResponseEntity<Void> approveDeviceCode(
            @Valid @RequestBody DeviceApproveRequest request,
            AuthContext auth,
            HttpServletRequest httpRequest) {
        // The "verification" step (RFC 8628 terms): a caller here already holds a valid
        // JWT, but the user_code space (8 chars, ~40 bits) is small enough that unlimited
        // authenticated attempts could still enumerate a pending code within its 10-minute
        // window. Same limiter, bucketed by IP and by the presented user_code.
        if (!authRateLimiterService.allowTokenAction(getClientIp(httpRequest), request.getUserCode())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Try again later.");
        }
        deviceAuthService.approveDeviceCode(
                request.getUserCode(), auth.requireUserId(), auth.organizationId());
        return ResponseEntity.ok().build();
    }

    private String getClientIp(HttpServletRequest request) {
        return trustedProxyResolver.resolve(request);
    }
}
