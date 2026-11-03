import { Module } from '@nestjs/common';
import { AccountProjectsRepository } from '@repositories/account-projects/account-projects.repository';
import { AccountProjectsController } from './account-projects.controller';
import { AccountProjectsService } from './account-projects.service';

@Module({
  controllers: [AccountProjectsController],
  providers: [AccountProjectsService, AccountProjectsRepository],
  exports: [AccountProjectsService],
})
export class AccountProjectsModule {}
