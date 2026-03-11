package com.webhook.platform.api.security;

import com.webhook.platform.api.dto.MemberResponse;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Verifies that invite tokens are never exposed in API responses.
 * Security fix for invite token leak vulnerability.
 */
class InviteTokenLeakTest {

    @Test
    void testMemberResponseDoesNotContainInviteTokenField() {
        // Given: Create a MemberResponse using builder
        MemberResponse response = MemberResponse.builder()
                .userId(java.util.UUID.randomUUID())
                .email("test@example.com")
                .role(com.webhook.platform.api.domain.enums.MembershipRole.DEVELOPER)
                .status(com.webhook.platform.api.domain.enums.MembershipStatus.INVITED)
                .createdAt(java.time.Instant.now())
                .build();

        // Then: MemberResponse should not have inviteToken field accessible
        // Reflection check to ensure field doesn't exist
        java.lang.reflect.Field[] fields = MemberResponse.class.getDeclaredFields();
        boolean hasInviteToken = false;
        for (java.lang.reflect.Field field : fields) {
            if (field.getName().equals("inviteToken")) {
                hasInviteToken = true;
                break;
            }
        }

        assertFalse(hasInviteToken, 
            "MemberResponse must not contain inviteToken field to prevent token leak");
    }

    @Test
    void testMemberResponseJsonSerialization() throws Exception {
        // Given: A MemberResponse
        MemberResponse response = MemberResponse.builder()
                .userId(java.util.UUID.randomUUID())
                .email("test@example.com")
                .role(com.webhook.platform.api.domain.enums.MembershipRole.DEVELOPER)
                .status(com.webhook.platform.api.domain.enums.MembershipStatus.INVITED)
                .createdAt(java.time.Instant.now())
                .build();

        // When: Serialize to JSON
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        mapper.registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule());
        String json = mapper.writeValueAsString(response);

        // Then: JSON should not contain inviteToken
        assertFalse(json.contains("inviteToken"), 
            "Serialized JSON must not contain inviteToken field");
        assertFalse(json.contains("invite_token"), 
            "Serialized JSON must not contain invite_token field (snake_case)");
    }

    @Test
    void testMemberResponseBuilderDoesNotHaveInviteTokenMethod() {
        // Verify that builder doesn't have inviteToken() method
        java.lang.reflect.Method[] methods = MemberResponse.MemberResponseBuilder.class.getDeclaredMethods();
        boolean hasInviteTokenMethod = false;
        for (java.lang.reflect.Method method : methods) {
            if (method.getName().equals("inviteToken")) {
                hasInviteTokenMethod = true;
                break;
            }
        }

        assertFalse(hasInviteTokenMethod, 
            "MemberResponse.Builder must not have inviteToken() method");
    }
}
