import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaBase } from '../profiles/prisma-base'; // fork:topology
import { createScopedPrisma } from '../profiles/scoped-prisma'; // fork:topology
import { profilesEnabled } from '../profiles/profiles.service'; // fork:topology

@Global()
@Module({
  providers: [
    PrismaBase, // fork:topology
    {
      // fork:topology: upstream code injects PrismaService and gets the profile-scoped client.
      provide: PrismaService,
      useFactory: (base: PrismaBase) => (profilesEnabled() ? createScopedPrisma(base) : base),
      inject: [PrismaBase],
    },
  ],
  exports: [PrismaService, PrismaBase], // fork:topology
})
export class PrismaModule {}
