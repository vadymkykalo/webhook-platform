package com.webhook.platform.worker.attempt;

/**
 * How one direction records its Attempts, and how a Claim on an obligation is taken, proved
 * and released. One adapter per direction; two adapters, so this is a real seam rather than
 * indirection.
 *
 * <h2>Why the Claim is a type parameter</h2>
 *
 * <p>{@code C} is the store's own Claim type and {@link AttemptRunner} is generic over it,
 * so the Runner is structurally incapable of reading a fencing token: it receives a {@code C}
 * from {@link #claim} and can do nothing with it but hand it back. Outgoing fences on a
 * {@code claim_token} UUID and Incoming CASes on {@code started_at}; both already work, and
 * unifying them would have bought a migration and a rolling-deploy compatibility window in
 * exchange for nothing.
 *
 * <h2>The invariant that costs a duplicated webhook when it is missed</h2>
 *
 * <p>{@link #finalise} returns whether the write <em>applied</em>. It must return false when
 * the row is no longer the one this Claim owns — reclaimed by a stuck sweep, or already
 * driven to a terminal state by another path. The Runner creates no successor Attempt unless
 * the finalisation applied, which is what stops a late writer queueing a second delivery of
 * a webhook that already succeeded.
 *
 * @param <C> the store's Claim type, opaque to the Runner
 */
public interface AttemptStore<C> {

    /**
     * Take exclusive ownership for the duration of one Attempt.
     *
     * <p>Implementations do their own admissibility checks here — the Outgoing store's FIFO
     * ordering gate lives inside this call and comes back as
     * {@link ClaimResult.Deferred} — so the Runner has no ordering concept at all.
     */
    ClaimResult<C> claim();

    /**
     * Build the request for this Attempt: signing, auth, client selection, headers.
     *
     * <p>Takes the already-transformed {@code body} because Outgoing computes its HMAC
     * signature over exactly the bytes that go out. Handing the store the finished body,
     * rather than letting it transform again, is what guarantees the signature and the
     * payload cannot disagree.
     */
    RequestSpec buildRequest(C claim, String body);

    /**
     * The body to send, with whatever transformation this direction has configured already
     * applied.
     *
     * <p>Resolving the transformation belongs here because the two directions resolve it
     * differently — Outgoing picks between a reusable Transformation and an inline template,
     * Incoming between a reusable one and an inline JSONPath expression. What does <em>not</em>
     * belong here is what to do when it fails: the Runner catches
     * {@link com.webhook.platform.worker.service.PayloadTransformException} and turns it into
     * a retryable failure, so no adapter is in a position to decide to send the raw payload
     * instead. That rule cost a hand-port once already.
     *
     * @throws com.webhook.platform.worker.service.PayloadTransformException when a configured
     *         transformation cannot be applied. Never return the untransformed payload.
     */
    String buildBody(C claim);

    /**
     * Called immediately before the request goes out, after admission has let it through.
     *
     * <p>Outgoing consumes an attempt here rather than after the response, so a crash
     * mid-send still counts against the Ladder instead of retrying forever. Incoming has
     * nothing to do: its row was created carrying its own attempt number.
     */
    default void attemptStarting(C claim) {
    }

    /**
     * Persist what this Attempt did. Always called before {@link #finalise}, and called even
     * for Attempts that never reached the network, so a rejected URL or an unusable Ladder
     * leaves a trace rather than vanishing.
     */
    void recordAttempt(C claim, AttemptRecord record);

    /**
     * Write the outcome, but only while this Claim still owns the row.
     *
     * @return true if the write applied; false if the row was reclaimed or already terminal.
     *         The Runner treats false as "somebody else owns this now" and stops.
     */
    boolean finalise(C claim, Finalization outcome);

    /**
     * Called once, after a {@link Finalization.Abandoned} that applied, for whatever the
     * direction does when it gives up: publishing a DLQ notification, releasing an ordering
     * buffer. Deliberately outside the finalising transaction — a Kafka or Redis failure here
     * must not roll back a DLQ write that already committed.
     */
    void onAbandoned(C claim);

    /**
     * Called once, after a {@link Finalization.Succeeded} that applied, for the same reason:
     * releasing the ordering buffer and letting the successors through is fire-and-forget and
     * must not be able to undo the committed success.
     */
    void onSucceeded(C claim);
}
