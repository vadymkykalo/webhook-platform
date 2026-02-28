package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.IncomingDestination;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface IncomingDestinationRepository extends JpaRepository<IncomingDestination, UUID> {

    List<IncomingDestination> findByIncomingSourceId(UUID incomingSourceId);

    List<IncomingDestination> findByIncomingSourceIdAndEnabledTrue(UUID incomingSourceId);

    Page<IncomingDestination> findByIncomingSourceId(UUID incomingSourceId, Pageable pageable);
}
