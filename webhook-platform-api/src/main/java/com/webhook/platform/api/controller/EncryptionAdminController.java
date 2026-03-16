package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.EncryptionRotationResponse;
import com.webhook.platform.api.dto.EncryptionStatusResponse;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.service.EncryptionKeyRotationService;
import com.webhook.platform.common.security.EncryptionKeyRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/v1/admin/encryption")
@Tag(name = "Encryption Admin", description = "Encryption key management and rotation (OWNER only)")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class EncryptionAdminController {

    private final EncryptionKeyRotationService rotationService;
    private final EncryptionKeyRegistry encryptionKeyRegistry;

    @Operation(
            summary = "Rotate encryption keys",
            description = "Re-encrypts all secrets (endpoints, incoming sources, incoming destinations) "
                    + "with the currently active encryption key version. Requires OWNER role."
    )
    @ApiResponse(responseCode = "200", description = "Rotation completed (check 'errors' field for partial failures)")
    @ApiResponse(responseCode = "403", description = "Forbidden — requires OWNER role")
    @ApiResponse(responseCode = "409", description = "Rotation already in progress on another node")
    @PostMapping("/rotate")
    public ResponseEntity<?> rotateEncryptionKeys(AuthContext auth) {
        auth.requireOwnerAccess();

        log.info("Encryption key rotation triggered by user {}", auth.userId());

        try {
            EncryptionKeyRotationService.RotationResult result = rotationService.rotateAll();

            EncryptionRotationResponse response = EncryptionRotationResponse.builder()
                    .status(result.errors() == 0 ? "completed" : "completed_with_errors")
                    .targetVersion(result.targetVersion())
                    .endpointsRotated(result.endpointsRotated())
                    .sourcesRotated(result.sourcesRotated())
                    .destinationsRotated(result.destinationsRotated())
                    .errors(result.errors())
                    .build();

            return ResponseEntity.ok(response);
        } catch (IllegalStateException e) {
            log.warn("Rotation lock conflict: {}", e.getMessage());
            return ResponseEntity.status(409).body(EncryptionRotationResponse.builder()
                    .status("locked")
                    .errors(-1)
                    .build());
        }
    }

    @Operation(
            summary = "Get encryption status",
            description = "Returns the active encryption key version and all available versions. Requires OWNER role."
    )
    @ApiResponse(responseCode = "200", description = "Encryption status returned")
    @ApiResponse(responseCode = "403", description = "Forbidden — requires OWNER role")
    @GetMapping("/status")
    public ResponseEntity<EncryptionStatusResponse> getEncryptionStatus(AuthContext auth) {
        auth.requireOwnerAccess();

        EncryptionStatusResponse response = EncryptionStatusResponse.builder()
                .activeKeyVersion(encryptionKeyRegistry.getActiveVersion())
                .availableVersions(encryptionKeyRegistry.getVersions())
                .build();

        return ResponseEntity.ok(response);
    }
}
