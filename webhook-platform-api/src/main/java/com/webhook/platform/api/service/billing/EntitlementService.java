package com.webhook.platform.api.service.billing;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.webhook.platform.api.domain.entity.Organization;
import com.webhook.platform.api.domain.entity.Plan;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.enums.TunnelStatus;
import com.webhook.platform.api.domain.repository.EndpointRepository;
import com.webhook.platform.api.domain.repository.EventRepository;
import com.webhook.platform.api.domain.repository.MembershipRepository;
import com.webhook.platform.api.domain.repository.OrganizationRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.domain.repository.TunnelSessionRepository;
import com.webhook.platform.api.exception.QuotaExceededException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Central quota & feature-flag enforcement.
 * When {@code billing.enabled=false} (self-hosted), all checks pass unconditionally.
 */
@Service
@Slf4j
public class EntitlementService {

    private final boolean billingEnabled;
    private final OrganizationRepository organizationRepository;
    private final ProjectRepository projectRepository;
    private final EndpointRepository endpointRepository;
    private final EventRepository eventRepository;
    private final MembershipRepository membershipRepository;
    private final TunnelSessionRepository tunnelSessionRepository;
    private final QuotaCounterService quotaCounterService;

    private final int defaultRateLimitPerSecond;
    private final int defaultMaxFanoutPerEvent;

    /** Plan cache: orgId → Plan. Avoids DB hit on every request. */
    private final Cache<UUID, Plan> planCache;

    public EntitlementService(
            @Value("${billing.enabled:false}") boolean billingEnabled,
            @Value("${entitlement.defaults.rate-limit-per-second:100}") int defaultRateLimitPerSecond,
            @Value("${entitlement.defaults.max-fanout-per-event:100}") int defaultMaxFanoutPerEvent,
            OrganizationRepository organizationRepository,
            ProjectRepository projectRepository,
            EndpointRepository endpointRepository,
            EventRepository eventRepository,
            MembershipRepository membershipRepository,
            TunnelSessionRepository tunnelSessionRepository,
            QuotaCounterService quotaCounterService) {
        this.billingEnabled = billingEnabled;
        this.defaultRateLimitPerSecond = defaultRateLimitPerSecond;
        this.defaultMaxFanoutPerEvent = defaultMaxFanoutPerEvent;
        this.organizationRepository = organizationRepository;
        this.projectRepository = projectRepository;
        this.endpointRepository = endpointRepository;
        this.eventRepository = eventRepository;
        this.membershipRepository = membershipRepository;
        this.tunnelSessionRepository = tunnelSessionRepository;
        this.quotaCounterService = quotaCounterService;
        this.planCache = Caffeine.newBuilder()
                .maximumSize(5_000)
                .expireAfterWrite(Duration.ofMinutes(5))
                .build();
    }

    // ── Quota checks ──────────────────────────────────────────────

    public void checkEventQuota(UUID organizationId) {
        if (!billingEnabled) return;
        Plan plan = getPlan(organizationId);
        if (plan.isUnlimited(plan.getMaxEventsPerMonth())) return;

        long currentMonthEvents = quotaCounterService.getCurrentCount(organizationId);
        if (currentMonthEvents >= plan.getMaxEventsPerMonth()) {
            throw new QuotaExceededException("events_per_month",
                    currentMonthEvents, plan.getMaxEventsPerMonth(), plan.getDisplayName());
        }
    }

    public void checkEndpointLimit(UUID projectId, UUID organizationId) {
        if (!billingEnabled) return;
        Plan plan = getPlan(organizationId);
        if (plan.isUnlimited(plan.getMaxEndpointsPerProject())) return;

        long count = endpointRepository.countByProjectIdAndDeletedAtIsNull(projectId);
        if (count >= plan.getMaxEndpointsPerProject()) {
            throw new QuotaExceededException("endpoints_per_project",
                    count, plan.getMaxEndpointsPerProject(), plan.getDisplayName());
        }
    }

    public void checkProjectLimit(UUID organizationId) {
        if (!billingEnabled) return;
        Plan plan = getPlan(organizationId);
        if (plan.isUnlimited(plan.getMaxProjects())) return;

        long count = projectRepository.countByOrganizationIdAndDeletedAtIsNull(organizationId);
        if (count >= plan.getMaxProjects()) {
            throw new QuotaExceededException("projects",
                    count, plan.getMaxProjects(), plan.getDisplayName());
        }
    }

    public void checkMemberLimit(UUID organizationId) {
        if (!billingEnabled) return;
        Plan plan = getPlan(organizationId);
        if (plan.isUnlimited(plan.getMaxMembers())) return;

        long count = membershipRepository.countByOrganizationId(organizationId);
        if (count >= plan.getMaxMembers()) {
            throw new QuotaExceededException("members",
                    count, plan.getMaxMembers(), plan.getDisplayName());
        }
    }

    public void checkTunnelLimit(UUID organizationId) {
        if (!billingEnabled) return;
        Plan plan = getPlan(organizationId);
        if (!plan.hasFeature("tunnels")) {
            throw new QuotaExceededException("tunnels",
                    0, 0, plan.getDisplayName());
        }
        if (plan.isUnlimited(plan.getMaxActiveTunnels())) return;

        long count = tunnelSessionRepository.countByOrganizationIdAndStatus(organizationId, TunnelStatus.ACTIVE);
        if (count >= plan.getMaxActiveTunnels()) {
            throw new QuotaExceededException("active_tunnels",
                    count, plan.getMaxActiveTunnels(), plan.getDisplayName());
        }
    }

    // ── Feature flags ─────────────────────────────────────────────

    public boolean hasFeature(UUID organizationId, String featureName) {
        if (!billingEnabled) return true;
        return getPlan(organizationId).hasFeature(featureName);
    }

    // ── Rate limit ────────────────────────────────────────────────

    public int getRateLimit(UUID organizationId) {
        if (!billingEnabled) return defaultRateLimitPerSecond;
        return getPlan(organizationId).getRateLimitPerSecond();
    }

    /**
     * Resolve rate limit for a project by looking up its organization's plan.
     * Used by EventController where only projectId is available (API key auth).
     */
    public int getRateLimitForProject(UUID projectId) {
        if (!billingEnabled) return defaultRateLimitPerSecond;
        Project project = projectRepository.findById(projectId).orElse(null);
        if (project == null) return defaultRateLimitPerSecond;
        return getRateLimit(project.getOrganizationId());
    }

    // ── Fanout limit ────────────────────────────────────────────

    public int getMaxFanoutForProject(UUID projectId) {
        if (!billingEnabled) return defaultMaxFanoutPerEvent;
        Project project = projectRepository.findById(projectId).orElse(null);
        if (project == null) return defaultMaxFanoutPerEvent;
        return getPlan(project.getOrganizationId()).getMaxFanoutPerEvent();
    }

    // ── Retention ─────────────────────────────────────────────────

    public int getRetentionDays(UUID organizationId) {
        if (!billingEnabled) return -1;
        return getPlan(organizationId).getMaxRetentionDays();
    }

    // ── Plan access ───────────────────────────────────────────────

    public Plan getPlan(UUID organizationId) {
        return planCache.get(organizationId, this::loadPlan);
    }

    public void evictPlanCache(UUID organizationId) {
        planCache.invalidate(organizationId);
    }

    // ── Internals ─────────────────────────────────────────────────

    private Plan loadPlan(UUID organizationId) {
        Organization org = organizationRepository.findById(organizationId)
                .orElseThrow(() -> new IllegalStateException("Organization not found: " + organizationId));
        return org.getPlan();
    }


    public boolean isBillingEnabled() {
        return billingEnabled;
    }
}
