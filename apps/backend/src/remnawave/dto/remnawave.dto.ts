import { createZodDto } from 'nestjs-zod';
import {
  createRemnawaveIntegrationSchema,
  remnawaveIntegrationSchema,
  remnawaveRevealSchema,
  remnawaveSyncSummarySchema,
  remnawaveTestResultSchema,
  updateRemnawaveIntegrationSchema,
} from '@infra/shared';

export class RemnawaveIntegrationDto extends createZodDto(remnawaveIntegrationSchema) {}
export class CreateRemnawaveIntegrationDto extends createZodDto(createRemnawaveIntegrationSchema) {}
export class UpdateRemnawaveIntegrationDto extends createZodDto(updateRemnawaveIntegrationSchema) {}
export class RemnawaveTestResultDto extends createZodDto(remnawaveTestResultSchema) {}
export class RemnawaveSyncSummaryDto extends createZodDto(remnawaveSyncSummarySchema) {}
export class RemnawaveRevealDto extends createZodDto(remnawaveRevealSchema) {}
