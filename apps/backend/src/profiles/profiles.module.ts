import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ProfilesRepository } from '@repositories/profiles/profiles.repository';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProfileScopeInterceptor } from './profile-scope.interceptor';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

// Global, because the profile-aware notification classes (provided inside NotificationsModule)
// need ProfilesService, while the controller below needs NotificationsModule: splitting avoids a cycle.
@Global()
@Module({
  providers: [ProfilesService, ProfilesRepository],
  exports: [ProfilesService],
})
export class ProfilesCoreModule {}

@Module({
  imports: [NotificationsModule],
  controllers: [ProfilesController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: ProfileScopeInterceptor }],
})
export class ProfilesModule {}
