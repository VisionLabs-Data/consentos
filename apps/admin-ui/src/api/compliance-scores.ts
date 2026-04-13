import type {
  ComplianceScoreSummary,
  ComplianceScoreTrendResponse,
  ValidationResultResponse,
} from '../types/api';
import apiClient from './client';

export async function getComplianceScoreSummary(
  siteId: string,
): Promise<ComplianceScoreSummary> {
  const { data } = await apiClient.get<ComplianceScoreSummary>(
    `/sites/${siteId}/compliance-scores`,
  );
  return data;
}

export async function getComplianceScoreTrend(
  siteId: string,
  params?: { framework?: string; days?: number },
): Promise<ComplianceScoreTrendResponse> {
  const { data } = await apiClient.get<ComplianceScoreTrendResponse>(
    `/sites/${siteId}/compliance-scores/trend`,
    { params },
  );
  return data;
}

export async function triggerConsentValidation(
  siteId: string,
  url?: string,
): Promise<ValidationResultResponse> {
  const { data } = await apiClient.post<ValidationResultResponse>(
    `/sites/${siteId}/validate-consent`,
    url ? { url } : null,
  );
  return data;
}
