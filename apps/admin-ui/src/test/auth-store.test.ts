import { describe, expect, it, vi, beforeEach } from 'vitest';

// We test the store logic in isolation
describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('starts unauthenticated when no token is stored', async () => {
    const { useAuthStore } = await import('../stores/auth');
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it('starts authenticated when a token exists in localStorage', async () => {
    localStorage.setItem('access_token', 'test-token');
    const { useAuthStore } = await import('../stores/auth');
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
  });

  it('logout clears tokens and resets state', async () => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('refresh_token', 'test-refresh');
    const { useAuthStore } = await import('../stores/auth');

    useAuthStore.getState().logout();

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });
});
