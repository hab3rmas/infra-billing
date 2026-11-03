import { z } from 'zod';
import { isoDateSchema, uuidSchema } from './common';

// Extra HTTP headers for a panel behind a reverse proxy, e.g. a secret cookie. Header names are
// tokens, values must not contain line breaks (header injection).
export const extraHeadersSchema = z
  .record(
    z.string().regex(/^[A-Za-z0-9-]+$/, 'header name'),
    z.string().refine((v) => !/[\r\n]/.test(v), 'no line breaks'),
  )
  .refine((h) => Object.keys(h).length <= 20, 'at most 20 headers');

const baseUrlSchema = z
  .string()
  .url()
  .max(500)
  .describe('Panel URL: https://, or http:// for localhost / private addresses');

export const remnawaveIntegrationSchema = z.object({
  uuid: uuidSchema.describe('Integration UUID'),
  name: z.string().describe('Name'),
  mapUuid: uuidSchema.describe('Target map'),
  enabled: z.boolean().describe('Enabled'),
  baseUrl: z.string().describe('Panel URL'),
  tokenSet: z.boolean().describe('An API token is stored'),
  extraHeadersSet: z.boolean().describe('Extra headers are stored'),
  subscriptionUrl: z.string().nullable().describe('Subscription page URL'),
  panelServiceUuid: uuidSchema.nullable().describe('Billing service of the panel server'),
  subServiceUuid: uuidSchema.nullable().describe('Billing service of the subscription page server'),
  autoSync: z.boolean().describe('Sync together with the providers'),
  lastSyncAt: isoDateSchema.nullable().describe('Last sync'),
  lastSyncError: z.string().nullable().describe('Last sync error'),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type RemnawaveIntegration = z.infer<typeof remnawaveIntegrationSchema>;

export const createRemnawaveIntegrationSchema = z.object({
  name: z.string().min(1).max(100).describe('Name'),
  mapUuid: uuidSchema.describe('Target map'),
  baseUrl: baseUrlSchema,
  token: z.string().min(1).max(4000).describe('API token'),
  extraHeaders: extraHeadersSchema.optional().describe('Extra headers'),
  subscriptionUrl: z.string().url().max(500).nullable().optional().describe('Subscription page'),
  panelServiceUuid: uuidSchema.nullable().optional(),
  subServiceUuid: uuidSchema.nullable().optional(),
  enabled: z.boolean().optional(),
  autoSync: z.boolean().optional(),
});
export type CreateRemnawaveIntegration = z.infer<typeof createRemnawaveIntegrationSchema>;

// Token: omitted or "" = keep, null = delete. Same for extra headers ({} / null).
export const updateRemnawaveIntegrationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  mapUuid: uuidSchema.optional(),
  baseUrl: baseUrlSchema.optional(),
  token: z.string().max(4000).nullable().optional().describe('"" keeps, null deletes'),
  extraHeaders: extraHeadersSchema.nullable().optional().describe('null deletes'),
  subscriptionUrl: z.string().url().max(500).nullable().optional(),
  panelServiceUuid: uuidSchema.nullable().optional(),
  subServiceUuid: uuidSchema.nullable().optional(),
  enabled: z.boolean().optional(),
  autoSync: z.boolean().optional(),
});
export type UpdateRemnawaveIntegration = z.infer<typeof updateRemnawaveIntegrationSchema>;

export const remnawaveTestResultSchema = z.object({
  ok: z.boolean(),
  version: z.string().nullable().describe('Panel version, when the panel reports it'),
  nodes: z.number().int().nonnegative().describe('Number of nodes'),
  error: z.string().nullable(),
});
export type RemnawaveTestResult = z.infer<typeof remnawaveTestResultSchema>;

export const remnawaveSyncSummarySchema = z.object({
  nodesCreated: z.number().int().nonnegative(),
  nodesUpdated: z.number().int().nonnegative(),
  nodesHidden: z.number().int().nonnegative(),
  linksCreated: z.number().int().nonnegative(),
  linksUpdated: z.number().int().nonnegative(),
  linksRemoved: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});
export type RemnawaveSyncSummary = z.infer<typeof remnawaveSyncSummarySchema>;

export const remnawaveRevealSchema = z.object({
  token: z.string().nullable(),
  extraHeaders: z.record(z.string()).nullable(),
});
export type RemnawaveReveal = z.infer<typeof remnawaveRevealSchema>;
