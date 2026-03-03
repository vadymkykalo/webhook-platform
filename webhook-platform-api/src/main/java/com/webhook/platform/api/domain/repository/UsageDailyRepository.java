package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.UsageDaily;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UsageDailyRepository extends JpaRepository<UsageDaily, UUID> {
    List<UsageDaily> findByProjectIdAndDateBetweenOrderByDateDesc(UUID projectId, LocalDate from, LocalDate to);
    Optional<UsageDaily> findByProjectIdAndDate(UUID projectId, LocalDate date);
}
