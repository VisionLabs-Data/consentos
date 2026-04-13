import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import App from '../App';

// Mock extension discovery to avoid loading EE modules in tests
vi.mock('../extensions/registry', () => ({
  discoverExtensions: vi.fn(() => Promise.resolve()),
  getSiteDetailTabs: vi.fn(() => []),
  getPages: vi.fn(() => []),
  getNavItems: vi.fn(() => []),
}));

// Mock the auth store to control auth state
vi.mock('../stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    loadUser: vi.fn(),
  })),
}));

describe('App', () => {
  it('renders the login page when not authenticated', () => {
    render(<App />);
    // ConsentOS wordmark renders Consent + OS as two spans for two-tone colour
    expect(screen.getByText('Consent')).toBeInTheDocument();
    expect(screen.getByText('OS')).toBeInTheDocument();
    expect(screen.getByText('Sign in to manage your consent platform')).toBeInTheDocument();
  });

  it('renders email and password fields on login page', () => {
    render(<App />);
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders the sign in button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
