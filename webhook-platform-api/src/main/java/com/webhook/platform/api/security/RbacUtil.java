package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.enums.MembershipRole;

public class RbacUtil {

    public static void requireWriteAccess(MembershipRole role) {
        if (role == MembershipRole.VIEWER) {
            throw new RuntimeException("Viewers have read-only access");
        }
    }

    public static void requireOwnerAccess(MembershipRole role) {
        if (role != MembershipRole.OWNER) {
            throw new RuntimeException("Only owners can perform this action");
        }
    }
}
