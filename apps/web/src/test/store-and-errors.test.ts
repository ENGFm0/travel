import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '@/app/store/uiStore';
import { ApiError, isApiError, toApiError } from '@boardingpass/core';

describe('UI store', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ theme: 'system', locale: 'ar' });
  });

  it('cycles theme light -> dark -> system and persists', () => {
    const { toggleTheme } = useUIStore.getState();
    useUIStore.setState({ theme: 'light' });
    toggleTheme();
    expect(useUIStore.getState().theme).toBe('dark');
    toggleTheme();
    expect(useUIStore.getState().theme).toBe('system');
    // persisted to localStorage
    expect(localStorage.getItem('bp.ui.v1')).toContain('system');
  });

  it('toggles locale ar <-> en', () => {
    const { toggleLocale } = useUIStore.getState();
    toggleLocale();
    expect(useUIStore.getState().locale).toBe('en');
    toggleLocale();
    expect(useUIStore.getState().locale).toBe('ar');
  });
});

describe('Unified error contract', () => {
  it('maps a JSON error response to ApiError', async () => {
    const res = new Response(JSON.stringify({ code: 'TRIP_NOT_FOUND', message: 'الرحلة غير موجودة' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
    const err = await toApiError(res);
    expect(isApiError(err)).toBe(true);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('TRIP_NOT_FOUND');
    expect(err.message).toBe('الرحلة غير موجودة');
  });

  it('falls back to a generic contract on non-JSON body', async () => {
    const res = new Response('<html>oops</html>', { status: 500 });
    const err = await toApiError(res);
    expect(err.code).toBe('HTTP_500');
    expect(err.message).toBeTruthy();
  });
});
