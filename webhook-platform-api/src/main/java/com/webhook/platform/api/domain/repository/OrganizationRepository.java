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

    @Modifying
    @Query("UPDATE Organization o SET o.plan = :plan WHERE o.plan <> :plan")
    int bulkAssignPlan(@Param("plan") Plan plan);
}
