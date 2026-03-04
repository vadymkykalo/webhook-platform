package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.IncomingDestination;
import com.webhook.platform.api.domain.entity.IncomingSource;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.repository.IncomingDestinationRepository;
import com.webhook.platform.api.domain.repository.IncomingSourceRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.domain.repository.TransformationRepository;
import com.webhook.platform.api.dto.IncomingDestinationRequest;
import com.webhook.platform.api.dto.IncomingDestinationResponse;
import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;
import com.webhook.platform.common.enums.IncomingAuthType;
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
class IncomingDestinationServiceTest {

    @Mock
    private IncomingDestinationRepository destinationRepository;
    @Mock
    private IncomingSourceRepository sourceRepository;
    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private TransformationRepository transformationRepository;

    private IncomingDestinationService service;

    private final UUID orgId = UUID.randomUUID();
    private final UUID projectId = UUID.randomUUID();
    private final UUID sourceId = UUID.randomUUID();
    private final UUID destId = UUID.randomUUID();

    private Project project;
    private IncomingSource source;

    @BeforeEach
    void setUp() {
        service = new IncomingDestinationService(
                destinationRepository, sourceRepository, projectRepository,
                transformationRepository,
                "test_encryption_key_32_chars_pad", "test_salt",
                true, List.of()
        );
        project = Project.builder().id(projectId).organizationId(orgId).name("Test").build();
        source = IncomingSource.builder()
                .id(sourceId).projectId(projectId).name("src")
                .slug("src").providerType(ProviderType.GENERIC)
                .status(IncomingSourceStatus.ACTIVE)
                .ingressPathToken("tok").verificationMode(VerificationMode.NONE)
                .build();
    }

    private IncomingDestination buildDest() {
        return IncomingDestination.builder()
                .id(destId).incomingSourceId(sourceId)
                .url("https://example.com/hook")
                .authType(IncomingAuthType.NONE)
                .enabled(true).maxAttempts(5).timeoutSeconds(30)
                .retryDelays("60,300,900")
                .createdAt(Instant.now()).updatedAt(Instant.now())
                .build();
    }

    private void stubOwnership() {
        when(sourceRepository.findById(sourceId)).thenReturn(Optional.of(source));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
    }

    @Test
    void createDestination_success() {
        stubOwnership();
        when(destinationRepository.saveAndFlush(any(IncomingDestination.class))).thenAnswer(inv -> {
            IncomingDestination d = inv.getArgument(0);
            d.setId(destId);
            d.setCreatedAt(Instant.now());
            d.setUpdatedAt(Instant.now());
            return d;
        });

        IncomingDestinationRequest request = IncomingDestinationRequest.builder()
                .url("https://example.com/hook")
                .authType(IncomingAuthType.BEARER)
                .authConfig("{\"token\":\"secret123\"}")
                .maxAttempts(3)
                .timeoutSeconds(15)
                .retryDelays("30,60")
                .build();

        IncomingDestinationResponse response = service.createDestination(sourceId, request, orgId);

        assertThat(response.getId()).isEqualTo(destId);
        assertThat(response.getUrl()).isEqualTo("https://example.com/hook");
        assertThat(response.getAuthType()).isEqualTo(IncomingAuthType.BEARER);
        assertThat(response.isAuthConfigured()).isTrue();
        assertThat(response.getMaxAttempts()).isEqualTo(3);
        assertThat(response.getTimeoutSeconds()).isEqualTo(15);
        assertThat(response.getRetryDelays()).isEqualTo("30,60");

        ArgumentCaptor<IncomingDestination> captor = ArgumentCaptor.forClass(IncomingDestination.class);
        verify(destinationRepository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getAuthConfigEncrypted()).isNotNull();
    }

    @Test
    void createDestination_defaultValues() {
        stubOwnership();
        when(destinationRepository.saveAndFlush(any())).thenAnswer(inv -> {
            IncomingDestination d = inv.getArgument(0);
            d.setId(destId);
            d.setCreatedAt(Instant.now());
            d.setUpdatedAt(Instant.now());
            return d;
        });

        IncomingDestinationRequest request = IncomingDestinationRequest.builder()
                .url("https://example.com/hook")
                .build();

        IncomingDestinationResponse response = service.createDestination(sourceId, request, orgId);

        assertThat(response.getAuthType()).isEqualTo(IncomingAuthType.NONE);
        assertThat(response.isEnabled()).isTrue();
        assertThat(response.getMaxAttempts()).isEqualTo(5);
        assertThat(response.getTimeoutSeconds()).isEqualTo(30);
    }

    @Test
    void createDestination_wrongOrg_forbidden() {
        UUID wrongOrg = UUID.randomUUID();
        stubOwnership();

        IncomingDestinationRequest request = IncomingDestinationRequest.builder()
                .url("https://example.com/hook")
                .build();

        assertThatThrownBy(() -> service.createDestination(sourceId, request, wrongOrg))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void getDestination_success() {
        IncomingDestination dest = buildDest();
        when(destinationRepository.findById(destId)).thenReturn(Optional.of(dest));
        stubOwnership();

        IncomingDestinationResponse response = service.getDestination(destId, orgId);
        assertThat(response.getUrl()).isEqualTo("https://example.com/hook");
    }

    @Test
    void getDestination_notFound() {
        when(destinationRepository.findById(destId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getDestination(destId, orgId))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void listDestinations_success() {
        stubOwnership();
        when(destinationRepository.findByIncomingSourceId(eq(sourceId), any()))
                .thenReturn(new PageImpl<>(List.of(buildDest())));

        Page<IncomingDestinationResponse> page = service.listDestinations(sourceId, orgId, PageRequest.of(0, 20));
        assertThat(page.getTotalElements()).isEqualTo(1);
    }

    @Test
    void updateDestination_success() {
        IncomingDestination dest = buildDest();
        when(destinationRepository.findById(destId)).thenReturn(Optional.of(dest));
        stubOwnership();
        when(destinationRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        IncomingDestinationRequest request = IncomingDestinationRequest.builder()
                .url("https://updated.com/hook")
                .authType(IncomingAuthType.BASIC)
                .enabled(false)
                .maxAttempts(10)
                .build();

        IncomingDestinationResponse response = service.updateDestination(destId, request, orgId);

        assertThat(response.getUrl()).isEqualTo("https://updated.com/hook");
        assertThat(response.getAuthType()).isEqualTo(IncomingAuthType.BASIC);
        assertThat(response.isEnabled()).isFalse();
        assertThat(response.getMaxAttempts()).isEqualTo(10);
    }

    @Test
    void deleteDestination_success() {
        IncomingDestination dest = buildDest();
        when(destinationRepository.findById(destId)).thenReturn(Optional.of(dest));
        stubOwnership();

        service.deleteDestination(destId, orgId);

        verify(destinationRepository).delete(dest);
    }
}
