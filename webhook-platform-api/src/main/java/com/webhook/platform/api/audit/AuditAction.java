package com.webhook.platform.api.audit;

public enum AuditAction {
    CREATE,
    UPDATE,
    DELETE,
    ROTATE_SECRET,
    REVOKE,
    REGISTER,
    LOGIN,
    LOGOUT,
    CONFIGURE_MTLS,
    TEST_WEBHOOK
}
