import { createZodDto } from 'nestjs-zod';
import {
  createProfileSchema,
  profileSchema,
  profileTestResultSchema,
  profilesConfigSchema,
  setProfileProjectsSchema,
  updateProfileSchema,
} from '@infra/shared';

export class ProfileDto extends createZodDto(profileSchema) {}
export class CreateProfileDto extends createZodDto(createProfileSchema) {}
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
export class SetProfileProjectsDto extends createZodDto(setProfileProjectsSchema) {}
export class ProfilesConfigDto extends createZodDto(profilesConfigSchema) {}
export class ProfileTestResultDto extends createZodDto(profileTestResultSchema) {}
