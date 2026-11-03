import { z } from 'zod';
import { iconBgSchema, iconNameSchema, isoDateSchema, uuidSchema } from './common';

export const profileSlugSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes');

// Telegram chat / topic ids are numeric strings (chat ids may be negative).
const telegramIdSchema = z.string().regex(/^-?\d{1,20}$/, 'numeric id');

export const profileSchema = z.object({
  uuid: uuidSchema.describe('Profile UUID'),
  name: z.string().describe('Profile name'),
  slug: profileSlugSchema.describe('URL slug for ?profile= links'),
  iconName: iconNameSchema.describe('Tabler icon name').nullable(),
  iconBg: iconBgSchema.describe('Icon tile background').nullable(),
  faviconLink: z.string().describe('Favicon / logo URL').nullable(),
  sortOrder: z.number().int().describe('Sort order'),
  defaultProjectUuid: uuidSchema.nullable().describe('Project for new services'),
  notificationsEnabled: z.boolean().describe('Send Telegram notifications for this profile'),
  telegramChatId: z.string().nullable().describe('Own Telegram chat (null = global)'),
  telegramTopicId: z.string().nullable().describe('Own Telegram topic (null = global)'),
  projectUuids: z.array(uuidSchema).describe('Projects in this profile'),
  servicesCount: z.number().int().nonnegative().describe('Services in this profile'),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Profile = z.infer<typeof profileSchema>;

export const createProfileSchema = z.object({
  name: z.string().min(1).max(60).describe('Profile name'),
  slug: profileSlugSchema.optional().describe('Slug (derived from the name when omitted)'),
  iconName: iconNameSchema.describe('Tabler icon name').optional(),
  iconBg: iconBgSchema.describe('Icon tile background').optional(),
  faviconLink: z.string().describe('Favicon / logo URL').optional(),
  defaultProjectUuid: uuidSchema.nullable().optional().describe('Project for new services'),
  notificationsEnabled: z.boolean().optional().describe('Telegram notifications'),
  telegramChatId: telegramIdSchema.nullable().optional().describe('Own Telegram chat'),
  telegramTopicId: telegramIdSchema.nullable().optional().describe('Own Telegram topic'),
  projectUuids: z.array(uuidSchema).max(500).optional().describe('Projects to put in the profile'),
});
export type CreateProfile = z.infer<typeof createProfileSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(60).optional().describe('Profile name'),
  slug: profileSlugSchema.optional().describe('Slug'),
  iconName: iconNameSchema.describe('Tabler icon name').nullable().optional(),
  iconBg: iconBgSchema.describe('Icon tile background').nullable().optional(),
  faviconLink: z.string().describe('Favicon / logo URL').nullable().optional(),
  sortOrder: z.number().int().optional().describe('Sort order'),
  defaultProjectUuid: uuidSchema.nullable().optional().describe('Project for new services'),
  notificationsEnabled: z.boolean().optional().describe('Telegram notifications'),
  telegramChatId: telegramIdSchema.nullable().optional().describe('Own Telegram chat'),
  telegramTopicId: telegramIdSchema.nullable().optional().describe('Own Telegram topic'),
});
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export const setProfileProjectsSchema = z.object({
  projectUuids: z.array(uuidSchema).max(500).describe('Projects of the profile (replaces the set)'),
});
export type SetProfileProjects = z.infer<typeof setProfileProjectsSchema>;

export const profilesConfigSchema = z.object({
  enabled: z.boolean().describe('Profiles feature flag (FORK_PROFILES)'),
});
export type ProfilesConfig = z.infer<typeof profilesConfigSchema>;

export const profileTestResultSchema = z.object({
  sent: z.boolean().describe('Whether Telegram accepted the message'),
});
export type ProfileTestResult = z.infer<typeof profileTestResultSchema>;
