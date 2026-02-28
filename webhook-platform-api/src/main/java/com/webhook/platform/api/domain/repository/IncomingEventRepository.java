package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.IncomingEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface IncomingEventRepository extends JpaRepository<IncomingEvent, UUID>, JpaSpecificationExecutor<IncomingEvent> {

    Page<IncomingEvent> findByIncomingSourceId(UUID incomingSourceId, Pageable pageable);

    @Query("SELECT e FROM IncomingEvent e WHERE e.incomingSourceId IN " +
            "(SELECT s.id FROM IncomingSource s WHERE s.projectId = :projectId) " +
            "ORDER BY e.receivedAt DESC")
    Page<IncomingEvent> findByProjectId(@Param("projectId") UUID projectId, Pageable pageable);

    @Query("SELECT e FROM IncomingEvent e WHERE e.incomingSourceId IN :sourceIds ORDER BY e.receivedAt DESC")
    Page<IncomingEvent> findBySourceIds(@Param("sourceIds") List<UUID> sourceIds, Pageable pageable);
}
