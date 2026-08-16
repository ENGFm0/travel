import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import '@/shared/i18n';
import { App } from '@/App';
import { useUIStore } from '@/app/store/uiStore';

/** US-014-SEC-001 / QA-001: automated accessibility gate.
 *  color-contrast is disabled here because jsdom cannot compute layout/colors;
 *  contrast is verified in the visual/e2e audit. Structural a11y rules run. */
describe('US-014 accessibility (axe)', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ theme: 'system', locale: 'ar' });
  });

  it('home shell has no critical/serious axe violations (AR/RTL)', async () => {
    const { container } = render(<App />);
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    if (serious.length) {
      // surface readable output on failure
      console.error(serious.map((v) => `${v.id}: ${v.help}`).join('\n'));
    }
    expect(serious).toEqual([]);
  });
});
