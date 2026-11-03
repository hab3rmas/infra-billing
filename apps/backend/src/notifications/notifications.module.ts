import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';
import { NotificationsController } from './notifications.controller';
import {
  ProfileAwareNotificationsService,
  ProfileAwareTelegramService,
} from '../profiles/profile-aware-notifications'; // fork:topology

@Module({
  imports: [AnalyticsModule],
  controllers: [NotificationsController],
  providers: [
    // fork:topology: profile-aware subclasses replace the originals under the same tokens.
    { provide: NotificationsService, useClass: ProfileAwareNotificationsService },
    { provide: TelegramService, useClass: ProfileAwareTelegramService },
  ],
  exports: [TelegramService],
})
export class NotificationsModule {}
