package com.webhook.platform.cli.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Persistent CLI configuration stored at ~/.config/hookflow/config.json
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CliConfig {

    private String backendUrl;
    private String accessToken;
    private String refreshToken;
    private String organizationId;
    private String userId;
    private String activeProjectId;

    public CliConfig() {
        this.backendUrl = "http://localhost:8080";
    }

    public String getBackendUrl() { return backendUrl; }
    public void setBackendUrl(String backendUrl) { this.backendUrl = backendUrl; }

    public String getAccessToken() { return accessToken; }
    public void setAccessToken(String accessToken) { this.accessToken = accessToken; }

    public String getRefreshToken() { return refreshToken; }
    public void setRefreshToken(String refreshToken) { this.refreshToken = refreshToken; }

    public String getOrganizationId() { return organizationId; }
    public void setOrganizationId(String organizationId) { this.organizationId = organizationId; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getActiveProjectId() { return activeProjectId; }
    public void setActiveProjectId(String activeProjectId) { this.activeProjectId = activeProjectId; }

    public boolean isAuthenticated() {
        return accessToken != null && !accessToken.isBlank();
    }

    public String getWsUrl() {
        return backendUrl.replace("https://", "wss://")
                .replace("http://", "ws://");
    }
}
