import { Module } from '@nestjs/common';
import { TopologyLinksRepository } from '@repositories/topology/topology-links.repository';
import { TopologyMapsRepository } from '@repositories/topology/topology-maps.repository';
import { TopologyNodesRepository } from '@repositories/topology/topology-nodes.repository';
import { TopologyServicesRepository } from '@repositories/topology/topology-services.repository';
import { TopologySettingsRepository } from '@repositories/topology/topology-settings.repository';
import { TabbyService } from './tabby.service';
import { TopologyController } from './topology.controller';
import { TopologyService } from './topology.service';

// The fork's repositories are provided here, not in the (upstream) global RepositoriesModule.
@Module({
  controllers: [TopologyController],
  providers: [
    TopologyService,
    TabbyService,
    TopologyMapsRepository,
    TopologyNodesRepository,
    TopologyLinksRepository,
    TopologySettingsRepository,
    TopologyServicesRepository,
  ],
  exports: [TopologyService],
})
export class TopologyModule {}
