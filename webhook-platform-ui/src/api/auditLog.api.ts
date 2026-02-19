import { http } from './http';

export interface AuditLogEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userId: string | null;
  organizationId: string | null;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface AuditLogPage {
  content: AuditLogEntry[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export const auditLogApi = {
  list: (page = 0, size = 20) =>
    http.get<AuditLogPage>(`/api/v1/audit-log?page=${page}&size=${size}`),
};
