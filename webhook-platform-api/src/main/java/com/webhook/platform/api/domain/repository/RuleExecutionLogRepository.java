package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.RuleExecutionLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.UUID;

@Repository
public interface RuleExecutionLogRepository extends JpaRepository<RuleExecutionLog, UUID> {

    Page<RuleExecutionLog> findByRuleIdOrderByExecutedAtDesc(UUID ruleId, Pageable pageable);

    Page<RuleExecutionLog> findByProjectIdOrderByExecutedAtDesc(UUID projectId, Pageable pageable);

    long countByRuleIdAndMatchedTrue(UUID ruleId);

    long countByRuleId(UUID ruleId);

    @Modifying
    @Query("DELETE FROM RuleExecutionLog l WHERE l.executedAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);
}
