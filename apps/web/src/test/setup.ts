import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

// jsdom lacks matchMedia; provide a controllable stub (defaults to light).
beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }
  localStorage.clear();
});
