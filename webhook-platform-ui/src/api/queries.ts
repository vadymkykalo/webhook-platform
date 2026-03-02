import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from './projects.api';
import { endpointsApi } from './endpoints.api';
import { deliveriesApi, type DeliveryFilters, type BulkReplayRequest } from './deliveries.api';
import { eventsApi } from './events.api';
import { subscriptionsApi, type SubscriptionRequest } from './subscriptions.api';
import { membersApi, type MembershipRole, type AddMemberRequest } from './members.api';
import { apiKeysApi, type ApiKeyRequest } from './apiKeys.api';
import { dashboardApi } from './dashboard.api';
import { dlqApi } from './dlq.api';
import { testEndpointsApi } from './testEndpoints.api';
import { auditLogApi } from './auditLog.api';
import { incomingSourcesApi } from './incomingSources.api';
import { incomingDestinationsApi } from './incomingDestinations.api';
import { incomingEventsApi, type IncomingEventFilters } from './incomingEvents.api';
import { schemasApi, type EventTypeCatalogRequest, type EventSchemaVersionRequest } from './schemas.api';
import type { EndpointRequest, IncomingSourceRequest, IncomingDestinationRequest, IncomingBulkReplayRequest } from '../types/api.types';

// ─── Query Keys ────────────────────────────────────────────────────

export const queryKeys = {
    projects: {
        all: ['projects'] as const,
        detail: (id: string) => ['projects', id] as const,
    },
    dashboard: {
        stats: (projectId: string) => ['dashboard', 'stats', projectId] as const,
        analytics: (projectId: string, period: string) => ['dashboard', 'analytics', projectId, period] as const,
    },
    endpoints: {
        list: (projectId: string) => ['endpoints', projectId] as const,
        paged: (projectId: string, page: number, size: number) => ['endpoints', projectId, 'paged', page, size] as const,
    },
    deliveries: {
        list: (projectId: string, filters: DeliveryFilters) => ['deliveries', projectId, filters] as const,
    },
    events: {
        list: (projectId: string, page: number, size: number) => ['events', projectId, page, size] as const,
    },
    subscriptions: {
        list: (projectId: string) => ['subscriptions', projectId] as const,
    },
    members: {
        list: (orgId: string) => ['members', orgId] as const,
    },
    apiKeys: {
        paged: (projectId: string, page: number, size: number) => ['api-keys', projectId, page, size] as const,
    },
    dlq: {
        list: (projectId: string, page: number, size: number) => ['dlq', projectId, page, size] as const,
    },
    testEndpoints: {
        list: (projectId: string) => ['test-endpoints', projectId] as const,
        requests: (projectId: string, endpointId: string) => ['test-endpoints', projectId, 'requests', endpointId] as const,
    },
    auditLog: {
        list: (page: number, size: number) => ['audit-log', page, size] as const,
    },
    incomingSources: {
        list: (projectId: string, page: number, size: number) => ['incoming-sources', projectId, page, size] as const,
        all: (projectId: string) => ['incoming-sources', projectId] as const,
        detail: (projectId: string, id: string) => ['incoming-sources', projectId, id] as const,
    },
    incomingDestinations: {
        list: (projectId: string, sourceId: string, page: number, size: number) => ['incoming-destinations', projectId, sourceId, page, size] as const,
        all: (projectId: string, sourceId: string) => ['incoming-destinations', projectId, sourceId] as const,
    },
    incomingEvents: {
        list: (projectId: string, filters: IncomingEventFilters) => ['incoming-events', projectId, filters] as const,
        detail: (projectId: string, id: string) => ['incoming-events', projectId, id] as const,
        attempts: (projectId: string, eventId: string) => ['incoming-events', projectId, eventId, 'attempts'] as const,
    },
    schemas: {
        eventTypes: (projectId: string) => ['schemas', projectId] as const,
        versions: (projectId: string, eventTypeId: string) => ['schemas', projectId, eventTypeId, 'versions'] as const,
        changes: (projectId: string, eventTypeId: string) => ['schemas', projectId, eventTypeId, 'changes'] as const,
        projectChanges: (projectId: string) => ['schemas', projectId, 'all-changes'] as const,
    },
} as const;

// ─── Projects ──────────────────────────────────────────────────────

export function useProjects() {
    return useQuery({
        queryKey: queryKeys.projects.all,
        queryFn: () => projectsApi.list(),
    });
}

export function useProject(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.projects.detail(projectId!),
        queryFn: () => projectsApi.get(projectId!),
        enabled: !!projectId,
    });
}

export function useCreateProject() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: { name: string; description?: string }) => projectsApi.create(data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.projects.all }); },
    });
}

export function useDeleteProject() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => projectsApi.delete(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.projects.all }); },
    });
}

// ─── Dashboard ─────────────────────────────────────────────────────

export function useDashboardStats(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.dashboard.stats(projectId!),
        queryFn: () => dashboardApi.getProjectStats(projectId!),
        enabled: !!projectId,
    });
}

export function useAnalytics(projectId: string | undefined, period: string) {
    return useQuery({
        queryKey: queryKeys.dashboard.analytics(projectId!, period),
        queryFn: () => dashboardApi.getAnalytics(projectId!, period),
        enabled: !!projectId,
    });
}

// ─── Endpoints ─────────────────────────────────────────────────────

export function useEndpoints(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.endpoints.list(projectId!),
        queryFn: () => endpointsApi.list(projectId!),
        enabled: !!projectId,
    });
}

export function useEndpointsPaged(projectId: string | undefined, page: number, size = 20) {
    return useQuery({
        queryKey: queryKeys.endpoints.paged(projectId!, page, size),
        queryFn: () => endpointsApi.listPaged(projectId!, page, size),
        enabled: !!projectId,
    });
}

export function useCreateEndpoint(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: EndpointRequest) => endpointsApi.create(projectId, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['endpoints', projectId] }); },
    });
}

export function useDeleteEndpoint(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => endpointsApi.delete(projectId, id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['endpoints', projectId] }); },
    });
}

export function useUpdateEndpoint(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: EndpointRequest }) => endpointsApi.update(projectId, id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['endpoints', projectId] }); },
    });
}

export function useRotateSecret(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => endpointsApi.rotateSecret(projectId, id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['endpoints', projectId] }); },
    });
}

export function useTestEndpointAction(projectId: string) {
    return useMutation({
        mutationFn: (id: string) => endpointsApi.test(projectId, id),
    });
}

export function useVerifyEndpoint(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => endpointsApi.verify(projectId, id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['endpoints', projectId] }); },
    });
}

export function useSkipVerification(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason?: string }) => endpointsApi.skipVerification(projectId, id, reason),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['endpoints', projectId] }); },
    });
}

// ─── Deliveries ────────────────────────────────────────────────────

export function useDeliveries(projectId: string | undefined, filters: DeliveryFilters) {
    return useQuery({
        queryKey: queryKeys.deliveries.list(projectId!, filters),
        queryFn: () => deliveriesApi.listByProject(projectId!, filters),
        enabled: !!projectId,
    });
}

export function useReplayDelivery() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (deliveryId: string) => deliveriesApi.replay(deliveryId),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['deliveries'] }); },
    });
}

export function useBulkReplayDeliveries() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (request: BulkReplayRequest) => deliveriesApi.bulkReplay(request),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['deliveries'] }); },
    });
}

// ─── Events ────────────────────────────────────────────────────────

export function useEvents(projectId: string | undefined, page: number, size = 20) {
    return useQuery({
        queryKey: queryKeys.events.list(projectId!, page, size),
        queryFn: () => eventsApi.listByProject(projectId!, { page, size }),
        enabled: !!projectId,
    });
}

// ─── Subscriptions ─────────────────────────────────────────────────

export function useSubscriptions(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.subscriptions.list(projectId!),
        queryFn: () => subscriptionsApi.list(projectId!),
        enabled: !!projectId,
    });
}

export function useCreateSubscription(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: SubscriptionRequest) => subscriptionsApi.create(projectId, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.subscriptions.list(projectId) }); },
    });
}

export function useUpdateSubscription(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: SubscriptionRequest }) => subscriptionsApi.update(projectId, id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.subscriptions.list(projectId) }); },
    });
}

export function usePatchSubscription(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<SubscriptionRequest> }) => subscriptionsApi.patch(projectId, id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.subscriptions.list(projectId) }); },
    });
}

export function useDeleteSubscription(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => subscriptionsApi.delete(projectId, id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.subscriptions.list(projectId) }); },
    });
}

// ─── Members ───────────────────────────────────────────────────────

export function useMembers(orgId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.members.list(orgId!),
        queryFn: () => membersApi.list(orgId!),
        enabled: !!orgId,
    });
}

export function useAddMember(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: AddMemberRequest) => membersApi.add(orgId, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.members.list(orgId) }); },
    });
}

export function useChangeMemberRole(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ userId, role }: { userId: string; role: MembershipRole }) =>
            membersApi.changeRole(orgId, userId, { role }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.members.list(orgId) }); },
    });
}

export function useRemoveMember(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (userId: string) => membersApi.remove(orgId, userId),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.members.list(orgId) }); },
    });
}

// ─── API Keys ──────────────────────────────────────────────────────

export function useApiKeysPaged(projectId: string | undefined, page: number, size = 20) {
    return useQuery({
        queryKey: queryKeys.apiKeys.paged(projectId!, page, size),
        queryFn: () => apiKeysApi.listPaged(projectId!, page, size),
        enabled: !!projectId,
    });
}

export function useCreateApiKey(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: ApiKeyRequest) => apiKeysApi.create(projectId, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys', projectId] }); },
    });
}

export function useRevokeApiKey(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => apiKeysApi.revoke(projectId, id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys', projectId] }); },
    });
}

// ─── DLQ ───────────────────────────────────────────────────────────

export function useDlq(projectId: string | undefined, page: number, size = 20) {
    return useQuery({
        queryKey: queryKeys.dlq.list(projectId!, page, size),
        queryFn: () => dlqApi.list(projectId!, page, size),
        enabled: !!projectId,
    });
}

export function useDlqStats(projectId: string | undefined) {
    return useQuery({
        queryKey: ['dlq', projectId, 'stats'] as const,
        queryFn: () => dlqApi.getStats(projectId!),
        enabled: !!projectId,
    });
}

export function useDlqRetry(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (deliveryId: string) => dlqApi.retrySingle(projectId, deliveryId),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['dlq', projectId] }); },
    });
}

export function useDlqBulkRetry(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (ids: string[]) => dlqApi.retryBulk(projectId, ids),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['dlq', projectId] }); },
    });
}

export function useDlqPurge(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => dlqApi.purgeAll(projectId),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['dlq', projectId] }); },
    });
}

// ─── Test Endpoints ────────────────────────────────────────────────

export function useTestEndpoints(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.testEndpoints.list(projectId!),
        queryFn: () => testEndpointsApi.list(projectId!),
        enabled: !!projectId,
    });
}

export function useTestEndpointRequests(projectId: string | undefined, endpointId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.testEndpoints.requests(projectId!, endpointId!),
        queryFn: () => testEndpointsApi.getRequests(projectId!, endpointId!),
        enabled: !!projectId && !!endpointId,
        refetchInterval: 5000,
    });
}

export function useCreateTestEndpoint(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => testEndpointsApi.create(projectId),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.testEndpoints.list(projectId) }); },
    });
}

export function useDeleteTestEndpoint(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => testEndpointsApi.delete(projectId, id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.testEndpoints.list(projectId) }); },
    });
}

// ─── Audit Log ─────────────────────────────────────────────────────

export function useAuditLog(page: number, size = 20) {
    return useQuery({
        queryKey: queryKeys.auditLog.list(page, size),
        queryFn: () => auditLogApi.list(page, size),
    });
}

// ─── Incoming Sources ─────────────────────────────────────────────

export function useIncomingSources(projectId: string | undefined, page: number, size = 20) {
    return useQuery({
        queryKey: queryKeys.incomingSources.list(projectId!, page, size),
        queryFn: () => incomingSourcesApi.list(projectId!, page, size),
        enabled: !!projectId,
    });
}

export function useIncomingSource(projectId: string | undefined, id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.incomingSources.detail(projectId!, id!),
        queryFn: () => incomingSourcesApi.get(projectId!, id!),
        enabled: !!projectId && !!id,
    });
}

export function useCreateIncomingSource(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: IncomingSourceRequest) => incomingSourcesApi.create(projectId, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['incoming-sources', projectId] }); },
    });
}

export function useUpdateIncomingSource(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: IncomingSourceRequest }) => incomingSourcesApi.update(projectId, id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['incoming-sources', projectId] }); },
    });
}

export function useDeleteIncomingSource(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => incomingSourcesApi.delete(projectId, id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['incoming-sources', projectId] }); },
    });
}

// ─── Incoming Destinations ────────────────────────────────────────

export function useIncomingDestinations(projectId: string | undefined, sourceId: string | undefined, page: number, size = 20) {
    return useQuery({
        queryKey: queryKeys.incomingDestinations.list(projectId!, sourceId!, page, size),
        queryFn: () => incomingDestinationsApi.list(projectId!, sourceId!, page, size),
        enabled: !!projectId && !!sourceId,
    });
}

export function useCreateIncomingDestination(projectId: string, sourceId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: IncomingDestinationRequest) => incomingDestinationsApi.create(projectId, sourceId, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['incoming-destinations', projectId, sourceId] }); },
    });
}

export function useUpdateIncomingDestination(projectId: string, sourceId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: IncomingDestinationRequest }) => incomingDestinationsApi.update(projectId, sourceId, id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['incoming-destinations', projectId, sourceId] }); },
    });
}

export function useDeleteIncomingDestination(projectId: string, sourceId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => incomingDestinationsApi.delete(projectId, sourceId, id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['incoming-destinations', projectId, sourceId] }); },
    });
}

// ─── Incoming Events ──────────────────────────────────────────────

export function useIncomingEvents(projectId: string | undefined, filters: IncomingEventFilters) {
    return useQuery({
        queryKey: queryKeys.incomingEvents.list(projectId!, filters),
        queryFn: () => incomingEventsApi.list(projectId!, filters),
        enabled: !!projectId,
    });
}

export function useIncomingEvent(projectId: string | undefined, id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.incomingEvents.detail(projectId!, id!),
        queryFn: () => incomingEventsApi.get(projectId!, id!),
        enabled: !!projectId && !!id,
    });
}

export function useIncomingEventAttempts(projectId: string | undefined, eventId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.incomingEvents.attempts(projectId!, eventId!),
        queryFn: () => incomingEventsApi.getAttempts(projectId!, eventId!),
        enabled: !!projectId && !!eventId,
    });
}

export function useReplayIncomingEvent(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (eventId: string) => incomingEventsApi.replay(projectId, eventId),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['incoming-events', projectId] }); },
    });
}

export function useBulkReplayIncomingEvents(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (request: IncomingBulkReplayRequest) => incomingEventsApi.bulkReplay(projectId, request),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['incoming-events', projectId] }); },
    });
}

// ─── Schema Registry ─────────────────────────────────────────────

export function useEventTypes(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.schemas.eventTypes(projectId!),
        queryFn: () => schemasApi.listEventTypes(projectId!),
        enabled: !!projectId,
    });
}

export function useCreateEventType(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: EventTypeCatalogRequest) => schemasApi.createEventType(projectId, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.schemas.eventTypes(projectId) }); },
    });
}

export function useDeleteEventType(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => schemasApi.deleteEventType(projectId, id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.schemas.eventTypes(projectId) }); },
    });
}

export function useSchemaVersions(projectId: string | undefined, eventTypeId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.schemas.versions(projectId!, eventTypeId!),
        queryFn: () => schemasApi.listVersions(projectId!, eventTypeId!),
        enabled: !!projectId && !!eventTypeId,
    });
}

export function useCreateSchemaVersion(projectId: string, eventTypeId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: EventSchemaVersionRequest) => schemasApi.createVersion(projectId, eventTypeId, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.schemas.versions(projectId, eventTypeId) });
            qc.invalidateQueries({ queryKey: queryKeys.schemas.eventTypes(projectId) });
            qc.invalidateQueries({ queryKey: queryKeys.schemas.changes(projectId, eventTypeId) });
        },
    });
}

export function usePromoteSchema(projectId: string, eventTypeId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (versionId: string) => schemasApi.promoteVersion(projectId, eventTypeId, versionId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.schemas.versions(projectId, eventTypeId) });
            qc.invalidateQueries({ queryKey: queryKeys.schemas.eventTypes(projectId) });
        },
    });
}

export function useDeprecateSchema(projectId: string, eventTypeId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (versionId: string) => schemasApi.deprecateVersion(projectId, eventTypeId, versionId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.schemas.versions(projectId, eventTypeId) });
            qc.invalidateQueries({ queryKey: queryKeys.schemas.eventTypes(projectId) });
        },
    });
}

export function useSchemaChanges(projectId: string | undefined, eventTypeId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.schemas.changes(projectId!, eventTypeId!),
        queryFn: () => schemasApi.listChanges(projectId!, eventTypeId!),
        enabled: !!projectId && !!eventTypeId,
    });
}

export function useProjectSchemaChanges(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.schemas.projectChanges(projectId!),
        queryFn: () => schemasApi.listProjectChanges(projectId!),
        enabled: !!projectId,
    });
}

export function useUpdateProject(projectId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: { name: string; description?: string; schemaValidationEnabled?: boolean; schemaValidationPolicy?: string }) =>
            projectsApi.update(projectId, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) }); },
    });
}
