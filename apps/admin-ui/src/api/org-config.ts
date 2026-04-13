import type { OrgConfig } from '../types/api';
import apiClient from './client';

export async function getOrgConfig(): Promise<OrgConfig> {
  const { data } = await apiClient.get<OrgConfig>('/org-config/');
  return data;
}

export async function updateOrgConfig(body: Partial<OrgConfig>): Promise<OrgConfig> {
  const { data } = await apiClient.put<OrgConfig>('/org-config/', body);
  return data;
}
