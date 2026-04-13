import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  announce,
  createLiveRegion,
  focusFirst,
  getFocusableElements,
  onEscape,
  prefersReducedMotion,
  trapFocus,
} from '../a11y';

describe('a11y', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('getFocusableElements', () => {
    it('should find buttons', () => {
      container.innerHTML = '<button>Click</button><button disabled>No</button>';
      const elements = getFocusableElements(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].tagName).toBe('BUTTON');
    });

    it('should find links with href', () => {
      container.innerHTML = '<a href="/test">Link</a><a>No href</a>';
      const elements = getFocusableElements(container);
      expect(elements).toHaveLength(1);
    });

    it('should find inputs', () => {
      container.innerHTML = '<input type="text" /><input type="checkbox" disabled />';
      const elements = getFocusableElements(container);
      expect(elements).toHaveLength(1);
    });

    it('should find elements with tabindex', () => {
      container.innerHTML = '<div tabindex="0">Focusable</div><div tabindex="-1">Not focusable</div>';
      const elements = getFocusableElements(container);
      expect(elements).toHaveLength(1);
    });

    it('should return empty array for no focusable elements', () => {
      container.innerHTML = '<div>Just text</div>';
      const elements = getFocusableElements(container);
      expect(elements).toHaveLength(0);
    });

    it('should search shadow DOM when present', () => {
      const shadow = container.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<button>Shadow button</button>';
      const elements = getFocusableElements(container);
      expect(elements).toHaveLength(1);
    });
  });

  describe('trapFocus', () => {
    it('should wrap Tab from last to first element', () => {
      container.innerHTML = '<button id="first">First</button><button id="last">Last</button>';
      const first = container.querySelector('#first') as HTMLElement;
      const last = container.querySelector('#last') as HTMLElement;
      last.focus();

      const cleanup = trapFocus(container);

      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      vi.spyOn(event, 'preventDefault');
      // Simulate activeElement being the last element
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(last);

      container.dispatchEvent(event);

      expect(event.preventDefault).toHaveBeenCalled();

      cleanup();
    });

    it('should wrap Shift+Tab from first to last element', () => {
      container.innerHTML = '<button id="first">First</button><button id="last">Last</button>';
      const first = container.querySelector('#first') as HTMLElement;
      first.focus();

      const cleanup = trapFocus(container);

      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true });
      vi.spyOn(event, 'preventDefault');
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(first);

      container.dispatchEvent(event);

      expect(event.preventDefault).toHaveBeenCalled();

      cleanup();
    });

    it('should not interfere with non-Tab keys', () => {
      container.innerHTML = '<button>Btn</button>';
      const cleanup = trapFocus(container);

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      vi.spyOn(event, 'preventDefault');

      container.dispatchEvent(event);

      expect(event.preventDefault).not.toHaveBeenCalled();

      cleanup();
    });

    it('should return a cleanup function that removes the listener', () => {
      container.innerHTML = '<button>Btn</button>';
      const cleanup = trapFocus(container);

      const spy = vi.spyOn(container, 'removeEventListener');
      cleanup();

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });

  describe('onEscape', () => {
    it('should call callback on Escape key', () => {
      const callback = vi.fn();
      const cleanup = onEscape(container, callback);

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      container.dispatchEvent(event);

      expect(callback).toHaveBeenCalledOnce();

      cleanup();
    });

    it('should not call callback on other keys', () => {
      const callback = vi.fn();
      const cleanup = onEscape(container, callback);

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      container.dispatchEvent(event);

      expect(callback).not.toHaveBeenCalled();

      cleanup();
    });

    it('should return a cleanup function', () => {
      const callback = vi.fn();
      const cleanup = onEscape(container, callback);

      cleanup();

      // After cleanup, Escape should not trigger callback
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      container.dispatchEvent(event);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('focusFirst', () => {
    it('should focus the first focusable element', () => {
      container.innerHTML = '<div>Text</div><button id="btn">Button</button><input />';
      const btn = container.querySelector('#btn') as HTMLElement;
      const spy = vi.spyOn(btn, 'focus');

      focusFirst(container);

      expect(spy).toHaveBeenCalled();
    });

    it('should do nothing when no focusable elements', () => {
      container.innerHTML = '<div>Just text</div>';
      // Should not throw
      focusFirst(container);
    });
  });

  describe('createLiveRegion', () => {
    it('should create an element with role=status', () => {
      const region = createLiveRegion(container);

      expect(region.getAttribute('role')).toBe('status');
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(region.getAttribute('aria-atomic')).toBe('true');
    });

    it('should append the region to the container', () => {
      const region = createLiveRegion(container);

      expect(container.contains(region)).toBe(true);
    });

    it('should have sr-only class for visual hiding', () => {
      const region = createLiveRegion(container);

      expect(region.className).toBe('cmp-sr-only');
    });
  });

  describe('announce', () => {
    it('should set text content on live region', async () => {
      const region = createLiveRegion(container);

      announce(region, 'Preferences expanded');

      // The announcement happens in the next animation frame
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(region.textContent).toBe('Preferences expanded');
    });

    it('should clear before setting to trigger re-announcement', () => {
      const region = createLiveRegion(container);
      region.textContent = 'Old message';

      announce(region, 'New message');

      // Immediately after call, text should be cleared
      expect(region.textContent).toBe('');
    });
  });

  describe('prefersReducedMotion', () => {
    it('should return false by default in test environment', () => {
      // JSDOM defaults to no media query match
      expect(prefersReducedMotion()).toBe(false);
    });

    it('should check the prefers-reduced-motion media query', () => {
      const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
      } as MediaQueryList);

      expect(prefersReducedMotion()).toBe(true);

      matchMediaSpy.mockRestore();
    });
  });
});
