import { createZodDto } from 'nestjs-zod';
import {
  adoptTabbyProfilesResultSchema,
  createTopologyLinkSchema,
  createTopologyMapSchema,
  createTopologyNodeSchema,
  seedFromServicesSchema,
  seedResultSchema,
  serviceSshTargetSchema,
  topologyGraphSchema,
  topologyLinkSchema,
  topologyMapSchema,
  topologyNodeSchema,
  topologySettingsSchema,
  updateTopologyLinkSchema,
  updateTopologyMapSchema,
  updateTopologyNodeSchema,
  updateTopologyPositionsSchema,
  updateTopologySettingsSchema,
} from '@infra/shared';

export class TopologyMapDto extends createZodDto(topologyMapSchema) {}
export class CreateTopologyMapDto extends createZodDto(createTopologyMapSchema) {}
export class UpdateTopologyMapDto extends createZodDto(updateTopologyMapSchema) {}
export class TopologyNodeDto extends createZodDto(topologyNodeSchema) {}
export class CreateTopologyNodeDto extends createZodDto(createTopologyNodeSchema) {}
export class UpdateTopologyNodeDto extends createZodDto(updateTopologyNodeSchema) {}
export class UpdateTopologyPositionsDto extends createZodDto(updateTopologyPositionsSchema) {}
export class TopologyLinkDto extends createZodDto(topologyLinkSchema) {}
export class CreateTopologyLinkDto extends createZodDto(createTopologyLinkSchema) {}
export class UpdateTopologyLinkDto extends createZodDto(updateTopologyLinkSchema) {}
export class TopologySettingsDto extends createZodDto(topologySettingsSchema) {}
export class UpdateTopologySettingsDto extends createZodDto(updateTopologySettingsSchema) {}
export class TopologyGraphDto extends createZodDto(topologyGraphSchema) {}
export class SeedFromServicesDto extends createZodDto(seedFromServicesSchema) {}
export class ServiceSshTargetDto extends createZodDto(serviceSshTargetSchema) {}
export class AdoptTabbyProfilesResultDto extends createZodDto(adoptTabbyProfilesResultSchema) {}
export class SeedResultDto extends createZodDto(seedResultSchema) {}
