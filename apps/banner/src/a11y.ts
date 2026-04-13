/**
 * Accessibility utilities for the consent banner.
 *
 * Provides focus trapping, keyboard navigation, and screen reader
 * announcements for WCAG 2.1 AA compliance.
 */

/**
 * Trap focus within a container element.
 * Returns a cleanup function to remove the event listener.
 */
export function trapFocus(container: HTMLElement): () => void {
  function handleKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;

    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: wrap from first to last
      if (document.activeElement === first || container.shadowRoot?.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: wrap from last to first
      if (document.activeElement === last || container.shadowRoot?.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  container.addEventListener('keydown', handleKeydown);
  return () => container.removeEventListener('keydown', handleKeydown);
}

/**
 * Set up Escape key to dismiss the banner.
 * Returns a cleanup function.
 */
export function onEscape(
  container: HTMLElement,
  callback: () => void,
): () => void {
  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      callback();
    }
  }

  container.addEventListener('keydown', handleKeydown);
  return () => container.removeEventListener('keydown', handleKeydown);
}

/**
 * Get all focusable elements within a container, including shadow DOM.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  // Check shadow root first
  const root = container.shadowRoot ?? container;
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

/**
 * Move focus to the first focusable element in the banner.
 */
export function focusFirst(container: HTMLElement): void {
  const elements = getFocusableElements(container);
  if (elements.length > 0) {
    elements[0].focus();
  }
}

/**
 * Create a visually hidden live region for screen reader announcements.
 * Returns the element so you can update its textContent.
 */
export function createLiveRegion(root: HTMLElement | ShadowRoot): HTMLElement {
  const region = document.createElement('div');
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  region.className = 'cmp-sr-only';
  root.appendChild(region);
  return region;
}

/**
 * Announce a message to screen readers via a live region.
 */
export function announce(liveRegion: HTMLElement, message: string): void {
  // Clear then set to ensure the screen reader picks up the change
  liveRegion.textContent = '';
  requestAnimationFrame(() => {
    liveRegion.textContent = message;
  });
}

/**
 * Check if the user prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
