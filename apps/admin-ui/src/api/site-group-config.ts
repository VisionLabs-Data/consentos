import type { SiteGroupConfig } from '../types/api';
import apiClient from './client';

export async function getSiteGroupConfig(groupId: string): Promise<SiteGroupConfig> {
  const { data } = await apiClient.get<SiteGroupConfig>(`/site-groups/${groupId}/config`);
  return data;
}

export async function updateSiteGroupConfig(
  groupId: string,
  body: Partial<SiteGroupConfig>,
): Promise<SiteGroupConfig> {
  const { data } = await apiClient.put<SiteGroupConfig>(
    `/site-groups/${groupId}/config`,
    body,
  );
  return data;
}
