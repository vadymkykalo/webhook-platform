import { http } from './http';

export interface TransformPreviewRequest {
  inputPayload: string;
  transformExpression?: string;
  customHeaders?: string;
}

export interface TransformPreviewResponse {
  outputPayload: string | null;
  outputHeaders: string | null;
  success: boolean;
  errors: string[];
}

export const transformApi = {
  preview: (projectId: string, data: TransformPreviewRequest): Promise<TransformPreviewResponse> =>
    http.post(`/api/v1/projects/${projectId}/transform-preview`, data),
};
