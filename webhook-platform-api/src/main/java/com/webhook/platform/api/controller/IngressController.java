package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.entity.IncomingEvent;
import com.webhook.platform.api.dto.IngressResponse;
import com.webhook.platform.api.service.IngressService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/ingress")
@Slf4j
@Tag(name = "Ingress", description = "Public incoming webhook ingress endpoint")
public class IngressController {

    private final IngressService ingressService;

    public IngressController(IngressService ingressService) {
        this.ingressService = ingressService;
    }

    @Operation(summary = "Receive incoming webhook",
            description = "Public endpoint for third-party providers to send webhooks. " +
                    "The token in the path identifies the incoming source configuration.")
    @ApiResponses({
            @ApiResponse(responseCode = "202", description = "Webhook accepted for processing",
                    content = @Content(schema = @Schema(implementation = IngressResponse.class))),
            @ApiResponse(responseCode = "404", description = "Invalid ingress token",
                    content = @Content(schema = @Schema(implementation = IngressResponse.class))),
            @ApiResponse(responseCode = "410", description = "Source is disabled",
                    content = @Content(schema = @Schema(implementation = IngressResponse.class))),
            @ApiResponse(responseCode = "413", description = "Payload too large",
                    content = @Content(schema = @Schema(implementation = IngressResponse.class)))
    })
    @PostMapping("/{token}")
    public ResponseEntity<IngressResponse> receiveWebhook(
            @PathVariable("token") String token,
            @RequestBody(required = false) String body,
            HttpServletRequest request) {
        try {
            IncomingEvent event = ingressService.receiveWebhook(token, body, request);
            return ResponseEntity.status(HttpStatus.ACCEPTED)
                    .body(IngressResponse.builder()
                            .status("accepted")
                            .requestId(event.getRequestId())
                            .build());
        } catch (IngressService.SourceNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(IngressResponse.builder()
                            .error("not_found")
                            .message("Invalid ingress endpoint")
                            .build());
        } catch (IngressService.SourceDisabledException e) {
            return ResponseEntity.status(HttpStatus.GONE)
                    .body(IngressResponse.builder()
                            .error("disabled")
                            .message("This ingress endpoint is disabled")
                            .build());
        } catch (IngressService.PayloadTooLargeException e) {
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                    .body(IngressResponse.builder()
                            .error("payload_too_large")
                            .message(e.getMessage())
                            .build());
        }
    }
}
