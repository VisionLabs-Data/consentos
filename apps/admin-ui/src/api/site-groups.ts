import type { SiteGroup } from '../types/api';
import apiClient from './client';

export async function listSiteGroups(): Promise<SiteGroup[]> {
  const { data } = await apiClient.get<SiteGroup[]>('/site-groups/');
  return data;
}

export async function getSiteGroup(id: string): Promise<SiteGroup> {
  const { data } = await apiClient.get<SiteGroup>(`/site-groups/${id}`);
  return data;
}

export async function createSiteGroup(body: {
  name: string;
  description?: string;
}): Promise<SiteGroup> {
  const { data } = await apiClient.post<SiteGroup>('/site-groups/', body);
  return data;
}

export async function updateSiteGroup(
  id: string,
  body: { name?: string; description?: string },
): Promise<SiteGroup> {
  const { data } = await apiClient.patch<SiteGroup>(`/site-groups/${id}`, body);
  return data;
}

export async function deleteSiteGroup(id: string): Promise<void> {
  await apiClient.delete(`/site-groups/${id}`);
}
