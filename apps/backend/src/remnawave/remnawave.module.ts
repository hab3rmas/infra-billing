import { Module } from '@nestjs/common';
import { RemnawaveRepository } from '@repositories/remnawave/remnawave.repository';
import { TopologyMapsRepository } from '@repositories/topology/topology-maps.repository';
import { TopologyServicesRepository } from '@repositories/topology/topology-services.repository';
import { RemnawaveController } from './remnawave.controller';
import { RemnawaveService } from './remnawave.service';

@Module({
  controllers: [RemnawaveController],
  providers: [
    RemnawaveService,
    RemnawaveRepository,
    // Stateless read helpers shared with the topology module.
    TopologyMapsRepository,
    TopologyServicesRepository,
  ],
  exports: [RemnawaveService],
})
export class RemnawaveModule {}
