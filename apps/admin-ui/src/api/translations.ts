import type { Translation } from '../types/api';
import apiClient from './client';

export async function listTranslations(siteId: string): Promise<Translation[]> {
  const { data } = await apiClient.get<Translation[]>(`/sites/${siteId}/translations/`);
  return data;
}

export async function getTranslation(siteId: string, locale: string): Promise<Translation> {
  const { data } = await apiClient.get<Translation>(`/sites/${siteId}/translations/${locale}`);
  return data;
}

export async function createTranslation(
  siteId: string,
  body: { locale: string; strings: Record<string, string> },
): Promise<Translation> {
  const { data } = await apiClient.post<Translation>(`/sites/${siteId}/translations/`, body);
  return data;
}

export async function updateTranslation(
  siteId: string,
  locale: string,
  body: { strings: Record<string, string> },
): Promise<Translation> {
  const { data } = await apiClient.put<Translation>(
    `/sites/${siteId}/translations/${locale}`,
    body,
  );
  return data;
}

export async function deleteTranslation(siteId: string, locale: string): Promise<void> {
  await apiClient.delete(`/sites/${siteId}/translations/${locale}`);
}
