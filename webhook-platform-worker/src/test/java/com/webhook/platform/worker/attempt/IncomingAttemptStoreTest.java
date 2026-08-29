package com.webhook.platform.worker.attempt;

import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.worker.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.worker.domain.repository.IncomingForwardAttemptRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers the store through the {@link AttemptStore} interface the Runner uses, rather than
 * through the service that constructs it.
 */
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

    @Nested
    @DisplayName("an Attempt that never reached the network still leaves a trace")
    class RecordSurvivesDeferral {

        @Test
        @DisplayName("a Deferred outcome persists what recordAttempt was given")
        void deferredPersistsTheRecord() {
            rowIs(processingRow());

            store.recordAttempt(claim(FENCE),
                    new AttemptRecord(null, null, null, null, null, "CIRCUIT_BREAKER_OPEN", 0));
            boolean applied = store.finalise(claim(FENCE),
                    new Finalization.Deferred(Instant.now().plusSeconds(30), "circuit breaker open"));

            assertThat(applied).isTrue();
            IncomingForwardAttempt row = saved();
            assertThat(row.getErrorMessage())
                    .as("an operator looking at why a destination went quiet needs to see the "
                            + "breaker rather than an unexplained gap")
                    .isEqualTo("CIRCUIT_BREAKER_OPEN");
        }

        @Test
        @DisplayName("deferring still hands the row back to the ladder")
        void deferredHandsTheRowBack() {
            rowIs(processingRow());
            Instant until = Instant.now().plusSeconds(30);

            store.finalise(claim(FENCE), new Finalization.Deferred(until, "circuit breaker open"));

            IncomingForwardAttempt row = saved();
            assertThat(row.getStatus()).isEqualTo(ForwardAttemptStatus.PENDING);
            assertThat(row.getClaimToken()).isNull();
            assertThat(row.getStartedAt()).isNull();
            assertThat(row.getNextRetryAt()).isEqualTo(until);
        }
    }
}
