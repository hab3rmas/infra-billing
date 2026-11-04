import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { FailureThrottle, clientIp, isFailure, isSensitivePath } from './login-throttle';

const IP_LIMIT = 8; // rejected attempts per window and address
const USER_LIMIT = 20; // per username: stops a slow attack spread over many addresses

export const loginThrottleEnabled = (): boolean => process.env.FORK_LOGIN_THROTTLE !== 'false';

// Counts rejected sign-ins (and wrong Bearer tokens) and answers 429 once a client or a username
// is over the limit. Runs for every request but only looks at the few that matter.
@Injectable()
export class LoginThrottleMiddleware implements NestMiddleware {
  private readonly logger = new Logger('LoginThrottle');
  private readonly throttle = new FailureThrottle();

  use(req: Request, res: Response, next: NextFunction): void {
    if (!loginThrottleEnabled()) {
      next();
      return;
    }
    const path = req.originalUrl.split('?')[0];
    const sensitive = isSensitivePath(path);
    const bearer = (req.headers.authorization ?? '').startsWith('Bearer ');
    if (!sensitive && !bearer) {
      next();
      return;
    }

    const ip = clientIp(req.socket.remoteAddress, req.headers['x-forwarded-for']);
    const body = req.body as { username?: unknown } | undefined;
    const username =
      sensitive && typeof body?.username === 'string'
        ? body.username.trim().toLowerCase().slice(0, 64)
        : null;
    const keys = [`ip:${ip}`, ...(username ? [`user:${username}`] : [])];

    const wait = Math.max(...keys.map((k) => this.throttle.blockedFor(k)));
    if (wait > 0) {
      res.setHeader('Retry-After', String(Math.ceil(wait / 1000)));
      res.status(429).json({
        error: { code: 'too_many_requests', message: 'Too many failed attempts, try again later' },
      });
      return;
    }

    res.on('finish', () => {
      if (isFailure(res.statusCode, sensitive)) {
        const tripped = [
          this.throttle.recordFailure(keys[0], IP_LIMIT),
          ...(keys[1] ? [this.throttle.recordFailure(keys[1], USER_LIMIT)] : []),
        ];
        const lock = Math.max(...tripped);
        if (lock > 0) {
          // The address is logged, the attempted username and any secret never are.
          this.logger.warn(
            `Blocked ${ip} for ${Math.round(lock / 60_000)} min after repeated failed sign-ins`,
          );
        }
      } else if (sensitive && res.statusCode < 400) {
        for (const k of keys) this.throttle.recordSuccess(k);
      }
    });
    next();
  }
}
