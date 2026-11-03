import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, from, mergeMap } from 'rxjs';
import { PROFILE_HEADER, uuidSchema } from '@infra/shared';
import { profileScopeStorage } from './profile-scope';
import { ProfilesService, profilesEnabled } from './profiles.service';

// Runs the whole request inside the scope of the profile named by X-Profile. No header (or
// "all") means no scope, i.e. exactly upstream's behaviour.
@Injectable()
export class ProfileScopeInterceptor implements NestInterceptor {
  constructor(private readonly profiles: ProfilesService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!profilesEnabled() || context.getType() !== 'http') return next.handle();
    const raw = context.switchToHttp().getRequest<Request>().header(PROFILE_HEADER);
    if (!raw || raw === 'all') return next.handle();
    if (!uuidSchema.safeParse(raw).success) {
      throw new BadRequestException(`${PROFILE_HEADER} must be a profile UUID`);
    }
    return from(this.profiles.scopeOf(raw)).pipe(
      mergeMap(
        (scope) =>
          new Observable<unknown>((subscriber) =>
            // AsyncLocalStorage must wrap the subscription: the handler starts running there.
            profileScopeStorage.run(scope, () => next.handle().subscribe(subscriber)),
          ),
      ),
    );
  }
}
