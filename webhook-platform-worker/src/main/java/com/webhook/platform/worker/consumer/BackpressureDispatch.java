package com.webhook.platform.worker.consumer;

import com.webhook.platform.worker.service.BoundedAsyncExecutor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.support.Acknowledgment;

/**
 * The one decision both consumers have to get right when the bounded executor is full.
 *
 * <p>Constructed per consumer rather than injected: the two directions run on separate
 * {@code BoundedAsyncExecutor} beans ({@code outgoingDeliveryExecutor} and
 * {@code incomingForwardExecutor}) with their own pools and their own pause behaviour, so
 * there is no single executor a shared bean could hold.
 *
 * <p>Not a base class either: each consumer must declare its own {@code @KafkaListener},
 * because the topics, the container factory and the group all differ. Inheritance would share only a
 * method body while pulling a parent's whole field set into both subclasses; a collaborator
 * puts the seam at a method call and is testable without a Kafka container.
 *
 * <h2>Why a full executor must still ack</h2>
 *
 * <p>Both listener factories set {@code asyncAcks(true)}, under which an unacked record is not
 * redelivered until a rebalance — and, because a later offset may already be acked, it blocks
 * this partition's offset commits rather than merely delaying one message. Kafka's job for the
 * record is done either way: the retry ladder, not Kafka redelivery, is what actually drives
 * reprocessing. So the obligation is handed back to the ladder explicitly and the record is
 * acked.
 *
 * <p>Getting this wrong stalls a partition until a restart, and it was got wrong on the
 * Incoming side for as long as the Outgoing side had it right — see commit {@code 2070d30},
 * and {@code docs/adr/0011-one-attempt-runner-for-both-directions.md}.
 */
@Slf4j
public class BackpressureDispatch {

    private final BoundedAsyncExecutor asyncExecutor;

    public BackpressureDispatch(BoundedAsyncExecutor asyncExecutor) {
        this.asyncExecutor = asyncExecutor;
    }

    /**
     * Submit {@code task}, or hand the obligation back to the retry ladder and ack.
     *
     * @param task       the work, run on the executor's pool; it acks for itself when it finishes
     * @param handBack   how this direction returns the obligation to its retry ladder. Must set
     *                   the row's next-retry time: both schedulers ignore rows without one, so a
     *                   hand-back that does not stamp it strands the obligation entirely
     * @param id         for the executor's own bookkeeping and for the log line
     */
    public void dispatch(Runnable task, Acknowledgment ack, String id, Runnable handBack) {
        if (asyncExecutor.trySubmit(task, ack, id)) {
            return;
        }
        // Containers are paused automatically to stop further polling, but this record has
        // already been handed to us.
        log.debug("Executor full, handing {} back to the retry ladder and acking", id);
        handBack.run();
        ack.acknowledge();
    }
}
