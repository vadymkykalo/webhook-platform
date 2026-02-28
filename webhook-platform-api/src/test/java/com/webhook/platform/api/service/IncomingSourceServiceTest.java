package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.IncomingSource;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.repository.IncomingSourceRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.IncomingSourceRequest;
import com.webhook.platform.api.dto.IncomingSourceResponse;
import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;
import com.webhook.platform.common.enums.IncomingSourceStatus;
import com.webhook.platform.common.enums.ProviderType;
import com.webhook.platform.common.enums.VerificationMode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IncomingSourceServiceTest {

    @Mock
    private IncomingSourceRepository sourceRepository;
    @Mock
    private ProjectRepository projectRepository;

    private IncomingSourceService service;

    private final UUID orgId = UUID.randomUUID();
    private final UUID projectId = UUID.randomUUID();
    private final UUID sourceId = UUID.randomUUID();

    private Project project;

    @BeforeEach
    void setUp() {
        service = new IncomingSourceService(
                sourceRepository, projectRepository,
                "test_encryption_key_32_chars_pad", "test_salt",
                "http://localhost:8080"
        );
        project = Project.builder()
                .id(projectId)
                .organizationId(orgId)
                .name("Test Project")
                .build();
    }

    private IncomingSource buildSource() {
        return IncomingSource.builder()
                .id(sourceId)
                .projectId(projectId)
                .name("GitHub Webhooks")
                .slug("github-webhooks")
                .providerType(ProviderType.GITHUB)
                .status(IncomingSourceStatus.ACTIVE)
                .ingressPathToken("abc123token")
                .verificationMode(VerificationMode.NONE)
                .hmacHeaderName("X-Signature")
                .hmacSignaturePrefix("")
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
    }

    @Test
    void createSource_success() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(sourceRepository.existsByProjectIdAndSlug(eq(projectId), anyString())).thenReturn(false);
        when(sourceRepository.existsByIngressPathToken(anyString())).thenReturn(false);
        when(sourceRepository.saveAndFlush(any(IncomingSource.class))).thenAnswer(inv -> {
            IncomingSource s = inv.getArgument(0);
            s.setId(sourceId);
            s.setCreatedAt(Instant.now());
            s.setUpdatedAt(Instant.now());
            return s;
        });

        IncomingSourceRequest request = IncomingSourceRequest.builder()
                .name("GitHub Webhooks")
                .slug("github-webhooks")
                .providerType(ProviderType.GITHUB)
                .verificationMode(VerificationMode.HMAC_GENERIC)
                .hmacSecret("my-secret")
                .hmacHeaderName("X-Hub-Signature-256")
                .hmacSignaturePrefix("sha256=")
                .build();

        IncomingSourceResponse response = service.createSource(projectId, request, orgId);

        assertThat(response.getId()).isEqualTo(sourceId);
        assertThat(response.getName()).isEqualTo("GitHub Webhooks");
        assertThat(response.getSlug()).isEqualTo("github-webhooks");
        assertThat(response.getProviderType()).isEqualTo(ProviderType.GITHUB);
        assertThat(response.getStatus()).isEqualTo(IncomingSourceStatus.ACTIVE);
        assertThat(response.getVerificationMode()).isEqualTo(VerificationMode.HMAC_GENERIC);
        assertThat(response.getHmacHeaderName()).isEqualTo("X-Hub-Signature-256");
        assertThat(response.getHmacSignaturePrefix()).isEqualTo("sha256=");
        assertThat(response.isHmacSecretConfigured()).isTrue();
        assertThat(response.getIngressUrl()).startsWith("http://localhost:8080/ingress/");

        ArgumentCaptor<IncomingSource> captor = ArgumentCaptor.forClass(IncomingSource.class);
        verify(sourceRepository).saveAndFlush(captor.capture());
        IncomingSource saved = captor.getValue();
        assertThat(saved.getHmacSecretEncrypted()).isNotNull();
        assertThat(saved.getHmacSecretIv()).isNotNull();
    }

    @Test
    void createSource_defaultValues() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(sourceRepository.existsByProjectIdAndSlug(eq(projectId), anyString())).thenReturn(false);
        when(sourceRepository.existsByIngressPathToken(anyString())).thenReturn(false);
        when(sourceRepository.saveAndFlush(any(IncomingSource.class))).thenAnswer(inv -> {
            IncomingSource s = inv.getArgument(0);
            s.setId(sourceId);
            s.setCreatedAt(Instant.now());
            s.setUpdatedAt(Instant.now());
            return s;
        });

        IncomingSourceRequest request = IncomingSourceRequest.builder()
                .name("My Source")
                .build();

        IncomingSourceResponse response = service.createSource(projectId, request, orgId);

        assertThat(response.getProviderType()).isEqualTo(ProviderType.GENERIC);
        assertThat(response.getVerificationMode()).isEqualTo(VerificationMode.NONE);
        assertThat(response.isHmacSecretConfigured()).isFalse();
    }

    @Test
    void createSource_duplicateSlug_throws() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(sourceRepository.existsByProjectIdAndSlug(projectId, "github-webhooks")).thenReturn(true);

        IncomingSourceRequest request = IncomingSourceRequest.builder()
                .name("GitHub Webhooks")
                .slug("github-webhooks")
                .build();

        assertThatThrownBy(() -> service.createSource(projectId, request, orgId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("already exists");
    }

    @Test
    void createSource_wrongOrg_forbidden() {
        UUID wrongOrg = UUID.randomUUID();
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));

        IncomingSourceRequest request = IncomingSourceRequest.builder()
                .name("Test")
                .build();

        assertThatThrownBy(() -> service.createSource(projectId, request, wrongOrg))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void getSource_success() {
        IncomingSource source = buildSource();
        when(sourceRepository.findById(sourceId)).thenReturn(Optional.of(source));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));

        IncomingSourceResponse response = service.getSource(sourceId, orgId);

        assertThat(response.getId()).isEqualTo(sourceId);
        assertThat(response.getName()).isEqualTo("GitHub Webhooks");
    }

    @Test
    void getSource_notFound() {
        when(sourceRepository.findById(sourceId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getSource(sourceId, orgId))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void listSources_success() {
        IncomingSource source = buildSource();
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(sourceRepository.findByProjectId(eq(projectId), any()))
                .thenReturn(new PageImpl<>(List.of(source)));

        Page<IncomingSourceResponse> page = service.listSources(projectId, orgId, PageRequest.of(0, 20));

        assertThat(page.getTotalElements()).isEqualTo(1);
        assertThat(page.getContent().get(0).getName()).isEqualTo("GitHub Webhooks");
    }

    @Test
    void updateSource_success() {
        IncomingSource source = buildSource();
        when(sourceRepository.findById(sourceId)).thenReturn(Optional.of(source));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(sourceRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        IncomingSourceRequest request = IncomingSourceRequest.builder()
                .name("Updated Name")
                .providerType(ProviderType.STRIPE)
                .status(IncomingSourceStatus.DISABLED)
                .build();

        IncomingSourceResponse response = service.updateSource(sourceId, request, orgId);

        assertThat(response.getName()).isEqualTo("Updated Name");
        assertThat(response.getProviderType()).isEqualTo(ProviderType.STRIPE);
        assertThat(response.getStatus()).isEqualTo(IncomingSourceStatus.DISABLED);
    }

    @Test
    void deleteSource_softDeletes() {
        IncomingSource source = buildSource();
        when(sourceRepository.findById(sourceId)).thenReturn(Optional.of(source));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));

        service.deleteSource(sourceId, orgId);

        assertThat(source.getStatus()).isEqualTo(IncomingSourceStatus.DISABLED);
        verify(sourceRepository).save(source);
    }
}
