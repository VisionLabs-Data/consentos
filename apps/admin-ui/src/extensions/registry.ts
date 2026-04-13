/**
 * UI extension registry for the open-core architecture.
 *
 * Provides registration hooks that allow enterprise/commercial code to
 * inject additional tabs, pages, and navigation items into the admin UI
 * without the core needing any direct knowledge of the extensions.
 *
 * In community edition (CE) mode the registry is simply empty and the
 * UI renders only the built-in tabs/pages.
 */

import type { ComponentType } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A tab injected into the site-detail page. */
export interface TabExtension {
  /** Unique identifier used as the tab key (e.g. ``"ee-analytics"``). */
  id: string;
  /** Human-readable label shown in the tab bar. */
  label: string;
  /**
   * React component rendered when the tab is active.
   *
   * Receives the same props that core tabs receive so extensions can
   * access the current site and config.
   */
  component: ComponentType<SiteDetailTabProps>;
  /** Optional sort order — higher values appear further right. Core tabs use 0–100. */
  order?: number;
}

/** Props forwarded to every site-detail tab (core and extension). */
export interface SiteDetailTabProps {
  siteId: string;
  site: unknown;
  config: unknown;
}

/** A page injected into the main router. */
export interface PageExtension {
  /** Route path (e.g. ``"/ee/billing"``). */
  path: string;
  /** React component rendered at this route. */
  component: ComponentType;
  /** Whether the page requires authentication (default ``true``). */
  protected?: boolean;
}

/** A navigation item injected into the top nav bar. */
export interface NavExtension {
  /** Route path the link points to. */
  path: string;
  /** Human-readable label. */
  label: string;
  /** Optional sort order — higher values appear further right. Core items use 0–100. */
  order?: number;
}

/* ------------------------------------------------------------------ */
/*  Internal state                                                     */
/* ------------------------------------------------------------------ */

const _tabs: TabExtension[] = [];
const _pages: PageExtension[] = [];
const _navItems: NavExtension[] = [];

/* ------------------------------------------------------------------ */
/*  Registration API                                                   */
/* ------------------------------------------------------------------ */

/** Register an additional tab on the site-detail page. */
export function registerSiteDetailTab(tab: TabExtension): void {
  if (!_tabs.some((t) => t.id === tab.id)) {
    _tabs.push(tab);
  }
}

/** Register an additional page/route. */
export function registerPage(page: PageExtension): void {
  if (!_pages.some((p) => p.path === page.path)) {
    _pages.push(page);
  }
}

/** Register an additional top-nav item. */
export function registerNavItem(item: NavExtension): void {
  if (!_navItems.some((n) => n.path === item.path)) {
    _navItems.push(item);
  }
}

/* ------------------------------------------------------------------ */
/*  Query API                                                          */
/* ------------------------------------------------------------------ */

/** Return all registered site-detail tabs, sorted by order. */
export function getSiteDetailTabs(): readonly TabExtension[] {
  return [..._tabs].sort((a, b) => (a.order ?? 200) - (b.order ?? 200));
}

/** Return all registered pages. */
export function getPages(): readonly PageExtension[] {
  return [..._pages];
}

/** Return all registered nav items, sorted by order. */
export function getNavItems(): readonly NavExtension[] {
  return [..._navItems].sort((a, b) => (a.order ?? 200) - (b.order ?? 200));
}

/* ------------------------------------------------------------------ */
/*  Discovery                                                          */
/* ------------------------------------------------------------------ */

/**
 * Attempt to load enterprise UI extensions.
 *
 * In the OSS repo this is a no-op.  In the cloud repo, the build
 * system replaces the virtual module ``virtual:ee-extensions`` with
 * the actual EE register module, enabling extension discovery.
 */
export async function discoverExtensions(): Promise<void> {
  try {
    // The virtual module is provided by the EE Vite plugin in the
    // cloud repo.  In OSS builds the import fails and we fall through
    // to the catch block silently.
    const mod = await import('virtual:ee-extensions');
    if (mod) {
      console.info('[CMP] Enterprise UI extensions loaded');
    }
  } catch {
    // No EE extensions available — running in community edition mode.
  }
}
