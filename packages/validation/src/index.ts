import { z } from 'zod';

/** @boardingpass/validation — shared Zod schemas (single source of truth for
 *  client + server-mirrored validation). Used by feature stories (US-001 auth,
 *  US-003 trips, …). Client validation is UX only; server re-validates (§24). */

// ── Auth (US-001) ─────────────────────────────────────────────────────────────
export const emailSchema = z.string().trim().toLowerCase().email();

export const passwordSchema = z
  .string()
  .min(8, 'PASSWORD_TOO_SHORT')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'PASSWORD_WEAK');

export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'PHONE_INVALID'); // E.164

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    middleName: z.string().trim().max(50).optional(),
    email: emailSchema,
    phone: phoneSchema.optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'PASSWORD_MISMATCH',
  });

// ── Trip basics (US-003) ──────────────────────────────────────────────────────
export const tripTypeSchema = z.enum(['DOMESTIC', 'INTERNATIONAL']);

export const createTripSchema = z
  .object({
    title: z.string().trim().min(2).max(80),
    type: tripTypeSchema,
    dateFrom: z.string().min(1), // ISO date
    dateTo: z.string().optional(),
    cities: z
      .array(
        z.object({
          name: z.string().trim().min(2).max(60),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
        }),
      )
      .min(1, 'AT_LEAST_ONE_CITY'),
  })
  .refine((d) => !d.dateTo || d.dateTo >= d.dateFrom, {
    path: ['dateTo'],
    message: 'END_BEFORE_START',
  });

// ── Flight lookup (US-004) ────────────────────────────────────────────────────
export const flightCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2}\d{1,4}$/, 'FLIGHT_CODE_INVALID');

export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateTripInput = z.infer<typeof createTripSchema>;
