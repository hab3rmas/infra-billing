import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { SettingsRepository } from '@repositories/settings/settings.repository';

// Upstream creates the Settings row lazily with an `upsert` on the first GET /api/settings. A fresh
// install's first page load fires several such requests at once and one of them hits a unique
// violation (a 500 in the log and the console). Creating the row once at startup removes the race
// without touching upstream's code.
@Injectable()
export class ForkBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(ForkBootstrapService.name);

  constructor(private readonly settings: SettingsRepository) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.settings.ensure();
    } catch (e) {
      // A failure here must not stop the panel: the lazy path still works, only racily.
      this.logger.warn(`Could not pre-create the settings row: ${(e as Error).message}`);
    }
  }
}
