import { createZodDto } from 'nestjs-zod';
import {
  accountProjectSchema,
  applyAccountProjectsResultSchema,
  setAccountProjectSchema,
} from '@infra/shared';

export class AccountProjectDto extends createZodDto(accountProjectSchema) {}
export class SetAccountProjectDto extends createZodDto(setAccountProjectSchema) {}
export class ApplyAccountProjectsResultDto extends createZodDto(applyAccountProjectsResultSchema) {}
