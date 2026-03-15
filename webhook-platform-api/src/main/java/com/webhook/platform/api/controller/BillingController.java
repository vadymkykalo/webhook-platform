package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.entity.Organization;
import com.webhook.platform.api.domain.entity.Plan;
import com.webhook.platform.api.dto.*;
import com.webhook.platform.api.domain.repository.EndpointRepository;
import com.webhook.platform.api.domain.repository.EventRepository;
import com.webhook.platform.api.domain.repository.MembershipRepository;
import com.webhook.platform.api.domain.repository.OrganizationRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.exception.NotFoundException;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.service.billing.BillingService;
import com.webhook.platform.api.service.billing.EntitlementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/billing")
@Tag(name = "Billing", description = "Plan catalog, usage, and subscription management")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class BillingController {

    private final BillingService billingService;
    private final EntitlementService entitlementService;
    private final OrganizationRepository organizationRepository;
    private final EventRepository eventRepository;
    private final ProjectRepository projectRepository;
    private final EndpointRepository endpointRepository;
    private final MembershipRepository membershipRepository;

    // ── Plan catalog (public) ─────────────────────────────────────

    @Operation(summary = "List available plans", description = "Returns all active plans with their limits and pricing")
    @GetMapping("/plans")
    public ResponseEntity<List<PlanResponse>> listPlans() {
        List<PlanResponse> plans = billingService.listActivePlans().stream()
                .filter(p -> !"self_hosted".equals(p.getName()))
                .map(this::mapPlan)
                .collect(Collectors.toList());
        return ResponseEntity.ok(plans);
    }

    // ── Organization billing ──────────────────────────────────────

    @Operation(summary = "Get organization billing info", description = "Returns current plan, billing status, and usage snapshot")
    @GetMapping("/organization")
    public ResponseEntity<OrganizationBillingResponse> getOrganizationBilling(AuthContext auth) {
        UUID orgId = auth.organizationId();
        Organization org = organizationRepository.findById(orgId)
                .orElseThrow(() -> new NotFoundException("Organization not found"));
        Plan plan = entitlementService.getPlan(orgId);

        YearMonth ym = YearMonth.now(ZoneOffset.UTC);
        Instant monthStart = ym.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant monthEnd = ym.plusMonths(1).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        long eventsThisMonth = eventRepository.countByOrganizationIdAndCreatedAtBetween(orgId, monthStart, monthEnd);
        long projectCount = projectRepository.countByOrganizationIdAndDeletedAtIsNull(orgId);

        OrganizationBillingResponse response = OrganizationBillingResponse.builder()
                .organizationId(orgId)
                .plan(mapPlan(plan))
                .billingStatus(org.getBillingStatus())
                .billingEmail(org.getBillingEmail())
                .usage(OrganizationBillingResponse.UsageSnapshot.builder()
                        .eventsThisMonth(eventsThisMonth)
                        .eventsLimit(plan.getMaxEventsPerMonth())
                        .projects(projectCount)
                        .projectsLimit(plan.getMaxProjects())
                        .build())
                .build();
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Update organization billing info", description = "Updates billing email for the organization (owner only)")
    @PutMapping("/organization")
    public ResponseEntity<OrganizationBillingResponse> updateBillingInfo(
            @Valid @RequestBody UpdateBillingRequest request,
            AuthContext auth) {
        auth.requireOwnerAccess();
        UUID orgId = auth.organizationId();
        Organization org = organizationRepository.findById(orgId)
                .orElseThrow(() -> new NotFoundException("Organization not found"));
        org.setBillingEmail(request.getBillingEmail());
        organizationRepository.save(org);
        return getOrganizationBilling(auth);
    }

    @Operation(summary = "Change organization plan", description = "Directly assigns a plan to the organization (owner only). " +
            "For paid plans, use checkout instead.")
    @PutMapping("/organization/plan")
    public ResponseEntity<OrganizationBillingResponse> changePlan(
            @Valid @RequestBody ChangePlanRequest request,
            AuthContext auth) {
        auth.requireOwnerAccess();
        billingService.assignPlan(auth.organizationId(), request.getPlanName());
        return getOrganizationBilling(auth);
    }

    // ── Usage ──────────────────────────────────────────────────────

    @Operation(summary = "Get detailed usage", description = "Returns current resource usage vs plan limits for all quota types")
    @GetMapping("/usage")
    public ResponseEntity<UsageResponse> getUsage(AuthContext auth) {
        UUID orgId = auth.organizationId();
        Plan plan = entitlementService.getPlan(orgId);

        YearMonth ym = YearMonth.now(ZoneOffset.UTC);
        Instant monthStart = ym.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant monthEnd = ym.plusMonths(1).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);

        long events = eventRepository.countByOrganizationIdAndCreatedAtBetween(orgId, monthStart, monthEnd);
        long projects = projectRepository.countByOrganizationIdAndDeletedAtIsNull(orgId);
        long members = membershipRepository.countByOrganizationId(orgId);
        long endpoints = endpointRepository.maxEndpointsPerProjectInOrg(orgId);

        UsageResponse response = UsageResponse.builder()
                .events(usage(events, plan.getMaxEventsPerMonth()))
                .endpoints(usage(endpoints, plan.getMaxEndpointsPerProject()))
                .projects(usage(projects, plan.getMaxProjects()))
                .members(usage(members, plan.getMaxMembers()))
                .rateLimitPerSecond(plan.getRateLimitPerSecond())
                .retentionDays(plan.getMaxRetentionDays())
                .periodStart(monthStart)
                .periodEnd(monthEnd)
                .build();
        return ResponseEntity.ok(response);
    }

    // ── Invoices ───────────────────────────────────────────────────

    @Operation(summary = "List invoices", description = "Returns invoice history from the billing provider. " +
            "Empty when billing is disabled (self-hosted).")
    @GetMapping("/invoices")
    public ResponseEntity<List<InvoiceResponse>> listInvoices(AuthContext auth) {
        // Invoices come from billing provider — delegated via BillingService
        List<InvoiceResponse> invoices = billingService.listInvoices(auth.organizationId());
        return ResponseEntity.ok(invoices);
    }

    // ── Checkout / Portal ─────────────────────────────────────────

    @Operation(summary = "Create checkout session", description = "Creates a billing provider checkout session for plan upgrade")
    @ApiResponse(responseCode = "200", description = "Checkout URL returned")
    @PostMapping("/checkout")
    public ResponseEntity<Map<String, String>> createCheckout(
            @Valid @RequestBody CheckoutRequest request,
            AuthContext auth) {
        auth.requireOwnerAccess();
        String url = billingService.createCheckoutSession(
                auth.organizationId(), request.getPlanName(),
                request.getProviderCode(), request.getBillingInterval(),
                request.getSuccessUrl(), request.getCancelUrl());
        return ResponseEntity.ok(Map.of("url", url));
    }

    @Operation(summary = "Create portal session", description = "Creates a billing provider portal session for managing subscription")
    @PostMapping("/portal")
    public ResponseEntity<Map<String, String>> createPortal(
            @RequestParam("returnUrl") String returnUrl,
            AuthContext auth) {
        auth.requireOwnerAccess();
        String url = billingService.createPortalSession(auth.organizationId(), returnUrl);
        return ResponseEntity.ok(Map.of("url", url));
    }

    @Operation(summary = "Cancel subscription", description = "Cancels the current subscription and downgrades to free plan")
    @PostMapping("/cancel")
    public ResponseEntity<Void> cancelSubscription(AuthContext auth) {
        auth.requireOwnerAccess();
        billingService.cancelSubscription(auth.organizationId());
        return ResponseEntity.noContent().build();
    }

    // ── Webhook (public, no auth — verified by provider signature) ─

    @Operation(summary = "Billing provider webhook",
            description = "Handles callbacks from billing providers. Each provider has its own endpoint. " +
                    "Signature verification is delegated to the BillingProvider adapter.")
    @ApiResponse(responseCode = "200", description = "Event processed")
    @PostMapping("/webhook/{providerCode}")
    public ResponseEntity<Void> handleWebhook(
            @PathVariable String providerCode,
            @RequestBody String rawPayload,
            @RequestHeader Map<String, String> headers) {
        billingService.processWebhook(providerCode, rawPayload, headers);
        return ResponseEntity.ok().build();
    }

    // ── Helpers ────────────────────────────────────────────────────

    private UsageResponse.ResourceUsage usage(long current, long limit) {
        double pct = limit <= 0 ? 0 : Math.min(100.0, (double) current / limit * 100);
        return UsageResponse.ResourceUsage.builder()
                .current(current)
                .limit(limit)
                .percentUsed(Math.round(pct * 10) / 10.0)
                .build();
    }

    private PlanResponse mapPlan(Plan plan) {
        return PlanResponse.builder()
                .id(plan.getId())
                .name(plan.getName())
                .displayName(plan.getDisplayName())
                .maxEventsPerMonth(plan.getMaxEventsPerMonth())
                .maxEndpointsPerProject(plan.getMaxEndpointsPerProject())
                .maxProjects(plan.getMaxProjects())
                .maxMembers(plan.getMaxMembers())
                .rateLimitPerSecond(plan.getRateLimitPerSecond())
                .maxRetentionDays(plan.getMaxRetentionDays())
                .features(plan.getFeatures())
                .priceMonthlyCents(plan.getPriceMonthlyCents())
                .priceYearlyCents(plan.getPriceYearlyCents())
                .build();
    }
}
