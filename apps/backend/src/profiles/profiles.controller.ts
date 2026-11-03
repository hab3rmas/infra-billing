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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FORK_API, FORK_API_SUB, FORK_CONTROLLERS_INFO, ID_PARAM } from '@infra/shared';
import { TelegramService } from '../notifications/telegram.service';
import {
  CreateProfileDto,
  ProfileDto,
  ProfileTestResultDto,
  ProfilesConfigDto,
  SetProfileProjectsDto,
  UpdateProfileDto,
} from './dto/profile.dto';
import { notificationScope, profileScopeStorage } from './profile-scope';
import { ProfilesService, profilesEnabled } from './profiles.service';

@ApiBearerAuth()
@ApiTags(FORK_CONTROLLERS_INFO.PROFILES.TAG)
@Controller(FORK_API.PROFILES)
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly telegram: TelegramService,
  ) {}

  @Get(FORK_API_SUB.PROFILES_CONFIG)
  @ApiOperation({ summary: 'Whether profiles are enabled (FORK_PROFILES)' })
  @ApiOkResponse({ type: ProfilesConfigDto })
  config() {
    return { enabled: profilesEnabled() };
  }

  @Get()
  @ApiOperation({ summary: 'List profiles' })
  @ApiOkResponse({ type: [ProfileDto] })
  list() {
    return this.profiles.list();
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a profile' })
  @ApiCreatedResponse({ type: ProfileDto })
  @ApiConflictResponse({ description: 'Slug is already taken' })
  create(@Body() dto: CreateProfileDto) {
    return this.profiles.create(dto);
  }

  @Patch(FORK_API_SUB.PROFILE_BY_ID)
  @ApiOperation({ summary: 'Update a profile' })
  @ApiOkResponse({ type: ProfileDto })
  update(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: UpdateProfileDto) {
    return this.profiles.update(uuid, dto);
  }

  @Put(FORK_API_SUB.PROFILE_PROJECTS)
  @ApiOperation({ summary: 'Set the projects of a profile (moves them from other profiles)' })
  @ApiOkResponse({ type: ProfileDto })
  setProjects(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: SetProfileProjectsDto) {
    return this.profiles.setProjects(uuid, dto.projectUuids);
  }

  @Delete(FORK_API_SUB.PROFILE_BY_ID)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a profile (projects and services are kept)' })
  @ApiNoContentResponse()
  @ApiQuery({ name: 'moveMapsTo', required: false, type: String })
  remove(
    @Param(ID_PARAM, ParseUUIDPipe) uuid: string,
    @Query('moveMapsTo', new ParseUUIDPipe({ optional: true })) moveMapsTo?: string,
  ) {
    return this.profiles.remove(uuid, moveMapsTo);
  }

  @Post(FORK_API_SUB.PROFILE_TEST)
  @ApiOperation({ summary: 'Send a test Telegram message labelled with the profile' })
  @ApiOkResponse({ type: ProfileTestResultDto })
  async test(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    const scope = notificationScope(await this.profiles.scopeOf(uuid));
    const sent = await profileScopeStorage.run(scope, () =>
      this.telegram.send('✅ Тестовое сообщение профиля'),
    );
    return { sent };
  }
}
