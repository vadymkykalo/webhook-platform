package com.webhook.platform.worker.attempt;

import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.worker.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.worker.domain.repository.IncomingForwardAttemptRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class IncomingAttemptStoreTest {

    private static final UUID EVENT_ID = UUID.randomUUID();
    private static final UUID DEST_ID = UUID.randomUUID();
    private static final UUID FENCE = UUID.randomUUID();

    @Mock
    private IncomingForwardAttemptRepository attemptRepository;

    @Mock
    private TransactionTemplate transactionTemplate;

    private IncomingAttemptStore store;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        when(transactionTemplate.execute(any())).thenAnswer(inv ->
                inv.getArgument(0, TransactionCallback.class).doInTransaction(null));

        store = new IncomingAttemptStore(
                attemptRepository, transactionTemplate,
                null, null, null, null, null, null, null, null, null);
    }

    @Test
    void deferralKeepsTheRecordedAttempt() {
        rowIs(processingRow());

        store.recordAttempt(claim(FENCE),
                new AttemptRecord(null, null, null, null, null, "CIRCUIT_BREAKER_OPEN", 0));
        boolean applied = store.finalise(claim(FENCE),
                new Finalization.Deferred(Instant.now().plusSeconds(30), "circuit breaker open"));

        assertThat(applied).isTrue();
        assertThat(saved().getErrorMessage()).isEqualTo("CIRCUIT_BREAKER_OPEN");
    }

    @Test
    void deferralHandsTheRowBackToTheLadder() {
        rowIs(processingRow());
        Instant until = Instant.now().plusSeconds(30);

        store.finalise(claim(FENCE), new Finalization.Deferred(until, "circuit breaker open"));

        IncomingForwardAttempt row = saved();
        assertThat(row.getStatus()).isEqualTo(ForwardAttemptStatus.PENDING);
        assertThat(row.getClaimToken()).isNull();
        assertThat(row.getStartedAt()).isNull();
        assertThat(row.getNextRetryAt()).isEqualTo(until);
    }

    @Test
    void unfencedClaimCannotFinaliseAClaimedRow() {
        rowIs(processingRow());

        assertThat(store.finalise(claim(null), new Finalization.Succeeded())).isFalse();
        verify(attemptRepository, never()).save(any());
    }

    @Test
    void unfencedClaimFinalisesAnUnclaimedRow() {
        IncomingForwardAttempt row = processingRow();
        row.setClaimToken(null);
        rowIs(row);

        assertThat(store.finalise(claim(null), new Finalization.Succeeded())).isTrue();
    }

    @Test
    void staleFenceCannotFinalise() {
        rowIs(processingRow());

        assertThat(store.finalise(claim(UUID.randomUUID()), new Finalization.Succeeded())).isFalse();
        verify(attemptRepository, never()).save(any());
    }

    private IncomingForwardAttempt processingRow() {
        return IncomingForwardAttempt.builder()
                .id(UUID.randomUUID())
                .incomingEventId(EVENT_ID)
                .destinationId(DEST_ID)
                .attemptNumber(1)
                .status(ForwardAttemptStatus.PROCESSING)
                .startedAt(Instant.now())
                .claimToken(FENCE)
                .build();
    }

    private IncomingAttemptStore.Claim claim(UUID fence) {
        return new IncomingAttemptStore.Claim(EVENT_ID, DEST_ID, 1, fence);
    }

    private void rowIs(IncomingForwardAttempt row) {
        when(attemptRepository.findByIncomingEventIdAndDestinationIdOrderByAttemptNumberDesc(EVENT_ID, DEST_ID))
                .thenReturn(List.of(row));
    }

    private IncomingForwardAttempt saved() {
        ArgumentCaptor<IncomingForwardAttempt> captor = ArgumentCaptor.forClass(IncomingForwardAttempt.class);
        verify(attemptRepository).save(captor.capture());
        return captor.getValue();
    }
}
