import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';

// Integration tests drive real multi-hop async chains (lazy route import → trip
// load → members load → feature-data load). On slower CI runners the default
// 1000ms findBy timeout is too tight; raise it so waits reflect actual work.
configure({ asyncUtilTimeout: 5000 });

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
