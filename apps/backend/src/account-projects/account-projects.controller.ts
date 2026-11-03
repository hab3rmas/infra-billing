import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_PARAM, FORK_API, FORK_API_SUB, FORK_CONTROLLERS_INFO } from '@infra/shared';
import { AccountProjectsService } from './account-projects.service';
import {
  AccountProjectDto,
  ApplyAccountProjectsResultDto,
  SetAccountProjectDto,
} from './dto/account-project.dto';

@ApiBearerAuth()
@ApiTags(FORK_CONTROLLERS_INFO.ACCOUNT_PROJECTS.TAG)
@Controller(FORK_API.ACCOUNT_PROJECTS)
export class AccountProjectsController {
  constructor(private readonly service: AccountProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Default project of every provider account' })
  @ApiOkResponse({ type: [AccountProjectDto] })
  list() {
    return this.service.list();
  }

  @Post(FORK_API_SUB.ACCOUNT_PROJECTS_APPLY)
  @ApiOperation({ summary: 'Move existing default-project services to their account project' })
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean })
  @ApiOkResponse({ type: ApplyAccountProjectsResultDto })
  apply(@Query('dryRun') dryRun?: string) {
    return this.service.apply(dryRun === 'true');
  }

  @Put(FORK_API_SUB.ACCOUNT_PROJECT_BY_ACCOUNT)
  @ApiOperation({ summary: 'Set (or clear) the default project of an account' })
  @ApiOkResponse({ type: AccountProjectDto })
  set(@Param(ACCOUNT_PARAM, ParseUUIDPipe) accountUuid: string, @Body() dto: SetAccountProjectDto) {
    return this.service.set(accountUuid, dto.projectUuid);
  }
}
