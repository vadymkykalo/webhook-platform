package com.webhook.platform.api.service.ingress;

import com.webhook.platform.api.domain.entity.IncomingEvent;

public class SignatureVerificationFailedException extends RuntimeException {
    private final IncomingEvent event;

    public SignatureVerificationFailedException(String message, IncomingEvent event) {
        super(message);
        this.event = event;
    }

    public IncomingEvent getEvent() {
        return event;
    }
}
