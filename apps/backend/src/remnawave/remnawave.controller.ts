import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FORK_API, FORK_API_SUB, FORK_CONTROLLERS_INFO, ID_PARAM } from '@infra/shared';
import { SessionOnly } from '../auth/session-only.decorator';
import {
  CreateRemnawaveIntegrationDto,
  RemnawaveIntegrationDto,
  RemnawaveRevealDto,
  RemnawaveSyncSummaryDto,
  RemnawaveTestResultDto,
  UpdateRemnawaveIntegrationDto,
} from './dto/remnawave.dto';
import { RemnawaveService } from './remnawave.service';

@ApiBearerAuth()
@ApiTags(FORK_CONTROLLERS_INFO.REMNAWAVE.TAG)
@Controller(FORK_API.REMNAWAVE)
export class RemnawaveController {
  constructor(private readonly remnawave: RemnawaveService) {}

  @Get(FORK_API_SUB.RW_INTEGRATIONS)
  @ApiOperation({ summary: 'List Remnawave integrations (no secrets)' })
  @ApiOkResponse({ type: [RemnawaveIntegrationDto] })
  list() {
    return this.remnawave.list();
  }

  @Post(FORK_API_SUB.RW_INTEGRATIONS)
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a Remnawave integration' })
  @ApiCreatedResponse({ type: RemnawaveIntegrationDto })
  create(@Body() dto: CreateRemnawaveIntegrationDto) {
    return this.remnawave.create(dto);
  }

  @Patch(FORK_API_SUB.RW_INTEGRATION_BY_ID)
  @ApiOperation({ summary: 'Update an integration ("" token keeps it, null deletes it)' })
  @ApiOkResponse({ type: RemnawaveIntegrationDto })
  update(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: UpdateRemnawaveIntegrationDto) {
    return this.remnawave.update(uuid, dto);
  }

  @Delete(FORK_API_SUB.RW_INTEGRATION_BY_ID)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an integration; its nodes and links stay unless ?purge=true' })
  @ApiQuery({ name: 'purge', required: false, type: Boolean })
  @ApiNoContentResponse()
  remove(
    @Param(ID_PARAM, ParseUUIDPipe) uuid: string,
    @Query('purge', new ParseBoolPipe({ optional: true })) purge?: boolean,
  ) {
    return this.remnawave.remove(uuid, purge === true);
  }

  @Post(FORK_API_SUB.RW_TEST)
  @ApiOperation({ summary: 'Check the connection: panel version and number of nodes' })
  @ApiOkResponse({ type: RemnawaveTestResultDto })
  test(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.remnawave.test(uuid);
  }

  @Post(FORK_API_SUB.RW_SYNC)
  @ApiOperation({ summary: 'Import the panel into the target map now' })
  @ApiOkResponse({ type: RemnawaveSyncSummaryDto })
  sync(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.remnawave.sync(uuid);
  }

  // Decrypted secrets: off-limits to API tokens, like the provider credentials reveal.
  @SessionOnly()
  @Post(FORK_API_SUB.RW_REVEAL)
  @HttpCode(200)
  @ApiOperation({ summary: 'Reveal the stored token and headers (explicit, session only)' })
  @ApiOkResponse({ type: RemnawaveRevealDto })
  reveal(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.remnawave.revealByUuid(uuid);
  }
}
