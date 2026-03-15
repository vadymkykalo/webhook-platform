package com.webhook.platform.api.service.billing;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.webhook.platform.api.domain.entity.Organization;
import com.webhook.platform.api.domain.entity.Plan;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.repository.EndpointRepository;
import com.webhook.platform.api.domain.repository.EventRepository;
import com.webhook.platform.api.domain.repository.MembershipRepository;
import com.webhook.platform.api.domain.repository.OrganizationRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
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
    private final QuotaCounterService quotaCounterService;

    /** Plan cache: orgId → Plan. Avoids DB hit on every request. */
    private final Cache<UUID, Plan> planCache;

    public EntitlementService(
            @Value("${billing.enabled:false}") boolean billingEnabled,
            OrganizationRepository organizationRepository,
            ProjectRepository projectRepository,
            EndpointRepository endpointRepository,
            EventRepository eventRepository,
            MembershipRepository membershipRepository,
            QuotaCounterService quotaCounterService) {
        this.billingEnabled = billingEnabled;
        this.organizationRepository = organizationRepository;
        this.projectRepository = projectRepository;
        this.endpointRepository = endpointRepository;
        this.eventRepository = eventRepository;
        this.membershipRepository = membershipRepository;
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

    // ── Feature flags ─────────────────────────────────────────────

    public boolean hasFeature(UUID organizationId, String featureName) {
        if (!billingEnabled) return true;
        return getPlan(organizationId).hasFeature(featureName);
    }

    // ── Rate limit ────────────────────────────────────────────────

    public int getRateLimit(UUID organizationId) {
        if (!billingEnabled) return Integer.MAX_VALUE;
        return getPlan(organizationId).getRateLimitPerSecond();
    }

    /**
     * Resolve rate limit for a project by looking up its organization's plan.
     * Used by EventController where only projectId is available (API key auth).
     */
    public int getRateLimitForProject(UUID projectId) {
        if (!billingEnabled) return Integer.MAX_VALUE;
        Project project = projectRepository.findById(projectId).orElse(null);
        if (project == null) return Integer.MAX_VALUE;
        return getRateLimit(project.getOrganizationId());
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
