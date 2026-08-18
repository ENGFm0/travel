import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/shared/i18n';
import { useUIStore } from '@/app/store/uiStore';
import { LocaleProvider } from '@/app/providers/LocaleProvider';
import { FlightLookup } from '@/features/flights/FlightLookup';
import { useFlightsStore } from '@/features/flights/flightsStore';
import { createMockFlightsService } from '@/features/flights/flightsService';
import { normalizeCode, isValidCode, flightSummary } from '@/features/flights/flightsModel';

// ── Pure model ────────────────────────────────────────────────────────────────
describe('US-004 flights model', () => {
  it('normalizes and validates flight codes', () => {
    expect(normalizeCode(' sv 1020 ')).toBe('SV1020');
    expect(isValidCode('SV1020')).toBe(true);
    expect(isValidCode('S1')).toBe(false);
    expect(isValidCode('ABCD')).toBe(false);
  });
  it('builds a one-line summary', () => {
    expect(flightSummary({ code: 'SV1', airline: 'Saudia', departure: { name: 'a', iata: 'RUH' }, arrival: { name: 'b', iata: 'LHR' } }))
      .toBe('Saudia · RUH→LHR');
  });
});

// ── Component ───────────────────────────────────────────────────────────────
beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  useFlightsStore.getState().setService(createMockFlightsService());
});
afterEach(() => vi.restoreAllMocks());

async function lookup(code: string, onFilled = vi.fn()) {
  render(<LocaleProvider><FlightLookup onFilled={onFilled} /></LocaleProvider>);
  await userEvent.type(screen.getByLabelText('Flight number'), code);
  await userEvent.click(screen.getByRole('button', { name: 'Auto-fill' }));
  return onFilled;
}

describe('US-004 FlightLookup', () => {
  it('fills airline + airports on a valid code (AC1) and calls onFilled', async () => {
    const onFilled = await lookup('SV1020');
    expect(await screen.findByText('RUH')).toBeInTheDocument();
    expect(screen.getByText('LHR')).toBeInTheDocument();
    expect(onFilled).toHaveBeenCalledWith(expect.objectContaining({ code: 'SV1020' }));
  });

  it('shows a "no data" message for a valid-but-empty result (AC2)', async () => {
    await lookup('ZZ9999');
    expect(await screen.findByText('No flight data found — enter the details manually.')).toBeInTheDocument();
  });

  it('shows a graceful error on upstream failure and re-enables the button (AC3)', async () => {
    await lookup('ER0001');
    expect(await screen.findByRole('alert')).toHaveTextContent('Flight service is unavailable');
    expect(screen.getByRole('button', { name: 'Auto-fill' })).not.toBeDisabled();
  });

  it('shows a throttle message when rate-limited (AC5)', async () => {
    await lookup('RL0001');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many lookups');
  });

  it('validates the code format before calling out (VR-004-001)', async () => {
    const onFilled = await lookup('abc');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid flight code');
    expect(onFilled).not.toHaveBeenCalled();
  });
});
