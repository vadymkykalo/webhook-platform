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
import type { EndpointRequest } from '../types/api.types';

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
