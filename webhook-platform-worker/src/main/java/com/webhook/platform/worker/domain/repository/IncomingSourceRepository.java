package com.webhook.platform.worker.domain.repository;

import com.webhook.platform.worker.domain.entity.IncomingSource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface IncomingSourceRepository extends JpaRepository<IncomingSource, UUID> {
}
