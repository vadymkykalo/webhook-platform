package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.exception.ForbiddenException;

public class RbacUtil {

    public static void requireWriteAccess(MembershipRole role) {
        if (role == MembershipRole.VIEWER) {
            throw new ForbiddenException("Viewers have read-only access");
        }
    }

    public static void requireOwnerAccess(MembershipRole role) {
        if (role != MembershipRole.OWNER) {
            throw new ForbiddenException("Only owners can perform this action");
        }
    }
}
