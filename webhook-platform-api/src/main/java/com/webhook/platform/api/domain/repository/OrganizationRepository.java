package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.Organization;
import com.webhook.platform.api.domain.entity.Plan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface OrganizationRepository extends JpaRepository<Organization, UUID> {

    /**
     * Loads an Organization with its Plan already fetched.
     *
     * <p>{@code Organization.plan} is LAZY, and with Open Session In View off, a proxy
     * returned to a caller outside the transaction cannot be initialised. EntitlementService caches
     * the Plan and hands it to request handlers, so it has to be a real object by the time the
     * transaction ends, not a proxy that fails on first use.
     */
    @Query("SELECT o FROM Organization o JOIN FETCH o.plan WHERE o.id = :id")
    Optional<Organization> findByIdWithPlan(@Param("id") UUID id);

    @Modifying
    @Query("UPDATE Organization o SET o.plan = :plan WHERE o.plan <> :plan")
    int bulkAssignPlan(@Param("plan") Plan plan);
}
