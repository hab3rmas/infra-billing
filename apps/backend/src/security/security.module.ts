import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ForkBootstrapService } from './fork-bootstrap.service';
import { LoginThrottleMiddleware } from './login-throttle.middleware';

// Production hardening that upstream does not have. FORK_LOGIN_THROTTLE=false switches the
// sign-in throttle off (it is on by default).
@Module({ providers: [LoginThrottleMiddleware, ForkBootstrapService] })
export class SecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoginThrottleMiddleware).forRoutes('*');
  }
}
