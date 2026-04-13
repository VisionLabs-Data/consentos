import type { ScanDiff, ScanJob, ScanJobDetail } from '../types/api';
import apiClient from './client';

export async function triggerScan(
  siteId: string,
  maxPages: number = 50,
): Promise<ScanJob> {
  const { data } = await apiClient.post<ScanJob>('/scanner/scans', {
    site_id: siteId,
    max_pages: maxPages,
  });
  return data;
}

export async function listScans(
  siteId: string,
  params?: { limit?: number; offset?: number },
): Promise<ScanJob[]> {
  const { data } = await apiClient.get<ScanJob[]>(`/scanner/scans/site/${siteId}`, { params });
  return data;
}

export async function getScan(scanId: string): Promise<ScanJobDetail> {
  const { data } = await apiClient.get<ScanJobDetail>(`/scanner/scans/${scanId}`);
  return data;
}

export async function getScanDiff(scanId: string): Promise<ScanDiff> {
  const { data } = await apiClient.get<ScanDiff>(`/scanner/scans/${scanId}/diff`);
  return data;
}
