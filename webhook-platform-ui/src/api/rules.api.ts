import { http } from './http';

export type ActionType = 'ROUTE' | 'TRANSFORM' | 'DROP' | 'TAG';

export interface RuleCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface RuleActionRequest {
  type: ActionType;
  endpointId?: string;
  transformationId?: string;
  config?: Record<string, unknown>;
  sortOrder?: number;
}

export interface RuleActionResponse {
  id: string;
  type: ActionType;
  endpointId: string | null;
  endpointUrl: string | null;
  transformationId: string | null;
  transformationName: string | null;
  config: Record<string, unknown>;
  sortOrder: number;
  createdAt: string;
}

export interface RuleRequest {
  name: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  eventTypePattern?: string | null;
  conditions?: RuleCondition[];
  conditionsOperator?: 'AND' | 'OR';
  actions?: RuleActionRequest[];
}

export interface RuleResponse {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  eventTypePattern: string | null;
  conditions: RuleCondition[];
  conditionsOperator: 'AND' | 'OR';
  actions: RuleActionResponse[];
  totalExecutions: number;
  totalMatches: number;
  createdAt: string;
  updatedAt: string;
}

export const rulesApi = {
  list: (projectId: string): Promise<RuleResponse[]> =>
    http.get<RuleResponse[]>(`/api/v1/projects/${projectId}/rules`),

  get: (projectId: string, id: string): Promise<RuleResponse> =>
    http.get<RuleResponse>(`/api/v1/projects/${projectId}/rules/${id}`),

  create: (projectId: string, data: RuleRequest): Promise<RuleResponse> =>
    http.post<RuleResponse>(`/api/v1/projects/${projectId}/rules`, data),

  update: (projectId: string, id: string, data: RuleRequest): Promise<RuleResponse> =>
    http.put<RuleResponse>(`/api/v1/projects/${projectId}/rules/${id}`, data),

  delete: (projectId: string, id: string): Promise<void> =>
    http.delete<void>(`/api/v1/projects/${projectId}/rules/${id}`),

  toggle: (projectId: string, id: string, enabled: boolean): Promise<RuleResponse> =>
    http.patch<RuleResponse>(`/api/v1/projects/${projectId}/rules/${id}/toggle`, { enabled }),
};
