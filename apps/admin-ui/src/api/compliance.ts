import type { ComplianceCheckResponse, ComplianceFramework } from '../types/api';
import apiClient from './client';

export async function runComplianceCheck(
  siteId: string,
  frameworks?: ComplianceFramework[],
): Promise<ComplianceCheckResponse> {
  const { data } = await apiClient.post<ComplianceCheckResponse>(
    `/compliance/check/${siteId}`,
    frameworks ? { frameworks } : {},
  );
  return data;
}

export async function listFrameworks(): Promise<{ frameworks: ComplianceFramework[] }> {
  const { data } = await apiClient.get<{ frameworks: ComplianceFramework[] }>('/compliance/frameworks');
  return data;
}
