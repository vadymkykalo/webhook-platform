package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.AuthResponse;
import com.webhook.platform.api.dto.DeviceApproveRequest;
import com.webhook.platform.api.dto.DeviceCodeResponse;
import com.webhook.platform.api.dto.DeviceTokenRequest;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.service.DeviceAuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth/device")
@Tag(name = "Device Authentication", description = "Device code flow for CLI authentication")
@RequiredArgsConstructor
public class DeviceAuthController {

    private final DeviceAuthService deviceAuthService;

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
    public ResponseEntity<AuthResponse> pollDeviceToken(@Valid @RequestBody DeviceTokenRequest request) {
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
            AuthContext auth) {
        deviceAuthService.approveDeviceCode(
                request.getUserCode(), auth.requireUserId(), auth.organizationId());
        return ResponseEntity.ok().build();
    }
}
