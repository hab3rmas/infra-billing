import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// The unscoped client. `PrismaService` (what upstream code injects) is provided as the scoped
// extension of this one, see prisma.module.ts. Both share one connection pool.
@Injectable()
export class PrismaBase extends PrismaService {}
