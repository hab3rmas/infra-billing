import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { FORK_API, FORK_API_SUB, FORK_CONTROLLERS_INFO, ID_PARAM } from '@infra/shared';
import {
  AdoptTabbyProfilesResultDto,
  ServiceSshTargetDto,
  CreateTopologyLinkDto,
  CreateTopologyMapDto,
  CreateTopologyNodeDto,
  SeedFromServicesDto,
  SeedResultDto,
  TopologyGraphDto,
  TopologyLinkDto,
  TopologyMapDocumentDto,
  TopologyMapDto,
  TopologyNodeDto,
  TopologySettingsDto,
  UpdateTopologyLinkDto,
  UpdateTopologyMapDto,
  UpdateTopologyNodeDto,
  UpdateTopologyPositionsDto,
  UpdateTopologySettingsDto,
} from './dto/topology.dto';
import { TabbyService } from './tabby.service';
import { TopologyService } from './topology.service';

@ApiBearerAuth()
@ApiTags(FORK_CONTROLLERS_INFO.TOPOLOGY.TAG)
@Controller(FORK_API.TOPOLOGY)
export class TopologyController {
  constructor(
    private readonly topology: TopologyService,
    private readonly tabby: TabbyService,
  ) {}

  @Get(FORK_API_SUB.TOPOLOGY_MAPS)
  @ApiOperation({ summary: 'List topology maps' })
  @ApiOkResponse({ type: [TopologyMapDto] })
  listMaps() {
    return this.topology.listMaps();
  }

  @Post(FORK_API_SUB.TOPOLOGY_MAPS)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a topology map (optionally with a new project)' })
  @ApiCreatedResponse({ type: TopologyMapDto })
  createMap(@Body() dto: CreateTopologyMapDto) {
    return this.topology.createMap(dto);
  }

  // Declared before maps/:uuid so "import" is never read as a map id.
  @Post(FORK_API_SUB.TOPOLOGY_MAP_IMPORT)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a map from an exported JSON document' })
  @ApiCreatedResponse({ type: TopologyMapDto })
  importMap(@Body() dto: TopologyMapDocumentDto) {
    return this.topology.importMap(dto);
  }

  @Get(FORK_API_SUB.TOPOLOGY_MAP_BY_ID)
  @ApiOperation({ summary: 'Get a map with its nodes and links' })
  @ApiOkResponse({ type: TopologyGraphDto })
  graph(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.topology.graph(uuid);
  }

  @Patch(FORK_API_SUB.TOPOLOGY_MAP_BY_ID)
  @ApiOperation({ summary: 'Update a map' })
  @ApiOkResponse({ type: TopologyMapDto })
  updateMap(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: UpdateTopologyMapDto) {
    return this.topology.updateMap(uuid, dto);
  }

  @Delete(FORK_API_SUB.TOPOLOGY_MAP_BY_ID)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a map (services are not touched)' })
  @ApiNoContentResponse()
  removeMap(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.topology.removeMap(uuid);
  }

  @Post(FORK_API_SUB.TOPOLOGY_MAP_DUPLICATE)
  @HttpCode(201)
  @ApiOperation({ summary: 'Duplicate a map with its nodes and links' })
  @ApiCreatedResponse({ type: TopologyMapDto })
  duplicate(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.topology.duplicateMap(uuid);
  }

  @Post(FORK_API_SUB.TOPOLOGY_MAP_SEED)
  @ApiOperation({ summary: 'Add nodes for the project’s VPS / dedicated services' })
  @ApiOkResponse({ type: SeedResultDto })
  seed(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: SeedFromServicesDto) {
    return this.topology.seedFromServices(uuid, dto);
  }

  @Post(FORK_API_SUB.TOPOLOGY_NODES)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a node' })
  @ApiCreatedResponse({ type: TopologyNodeDto })
  createNode(@Body() dto: CreateTopologyNodeDto) {
    return this.topology.createNode(dto);
  }

  // Declared before nodes/:uuid so "positions" is never read as a node id.
  @Patch(FORK_API_SUB.TOPOLOGY_POSITIONS)
  @ApiOperation({ summary: 'Save node positions in bulk' })
  @ApiOkResponse({ schema: { type: 'object', properties: { updated: { type: 'number' } } } })
  positions(@Body() dto: UpdateTopologyPositionsDto) {
    return this.topology.updatePositions(dto);
  }

  @Patch(FORK_API_SUB.TOPOLOGY_NODE_BY_ID)
  @ApiOperation({ summary: 'Update a node' })
  @ApiOkResponse({ type: TopologyNodeDto })
  updateNode(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: UpdateTopologyNodeDto) {
    return this.topology.updateNode(uuid, dto);
  }

  @Delete(FORK_API_SUB.TOPOLOGY_NODE_BY_ID)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a node (imported nodes are hidden instead)' })
  @ApiNoContentResponse()
  removeNode(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.topology.removeNode(uuid);
  }

  @Post(FORK_API_SUB.TOPOLOGY_LINKS)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a link' })
  @ApiCreatedResponse({ type: TopologyLinkDto })
  @ApiConflictResponse({ description: 'The same link already exists' })
  createLink(@Body() dto: CreateTopologyLinkDto) {
    return this.topology.createLink(dto);
  }

  @Patch(FORK_API_SUB.TOPOLOGY_LINK_BY_ID)
  @ApiOperation({ summary: 'Update a link' })
  @ApiOkResponse({ type: TopologyLinkDto })
  @ApiConflictResponse({ description: 'The same link already exists' })
  updateLink(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: UpdateTopologyLinkDto) {
    return this.topology.updateLink(uuid, dto);
  }

  @Delete(FORK_API_SUB.TOPOLOGY_LINK_BY_ID)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a link (imported links are hidden instead)' })
  @ApiNoContentResponse()
  removeLink(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.topology.removeLink(uuid);
  }

  @Get(FORK_API_SUB.TOPOLOGY_SETTINGS)
  @ApiOperation({ summary: 'Get topology settings' })
  @ApiOkResponse({ type: TopologySettingsDto })
  getSettings() {
    return this.topology.getSettings();
  }

  @Patch(FORK_API_SUB.TOPOLOGY_SETTINGS)
  @ApiOperation({ summary: 'Update topology settings' })
  @ApiOkResponse({ type: TopologySettingsDto })
  updateSettings(@Body() dto: UpdateTopologySettingsDto) {
    return this.topology.updateSettings(dto);
  }

  @Get(FORK_API_SUB.TOPOLOGY_TABBY_PROFILES)
  @ApiOperation({ summary: 'Tabby config.yaml fragment with an SSH profile per node (no secrets)' })
  @ApiProduces('application/yaml')
  @ApiOkResponse({ description: 'YAML text', schema: { type: 'string' } })
  async tabbyProfiles(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Type', 'application/yaml; charset=utf-8');
    return this.tabby.yaml();
  }

  @Post(FORK_API_SUB.TOPOLOGY_TABBY_ADOPT)
  @ApiOperation({ summary: 'Set empty tabbyProfile fields to the exported profile names' })
  @ApiOkResponse({ type: AdoptTabbyProfilesResultDto })
  adoptTabbyProfiles() {
    return this.tabby.adopt();
  }

  @Get(FORK_API_SUB.TOPOLOGY_SERVICE_TARGETS)
  @ApiOperation({ summary: 'SSH target (host, port, user, Tabby profile) per billing service' })
  @ApiOkResponse({ type: [ServiceSshTargetDto] })
  serviceTargets() {
    return this.tabby.serviceTargets();
  }
}
