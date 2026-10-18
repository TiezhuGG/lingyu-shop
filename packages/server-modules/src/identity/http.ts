import { CanActivate, createParamDecorator, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { RequestIdRequest } from '../foundation/http-boundary';
import { AppPrincipal, CustomerSessionService } from './service';

export interface AppAuthenticatedRequest extends RequestIdRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  principal?: AppPrincipal;
}

@Injectable()
export class AppAuthenticationGuard implements CanActivate {
  constructor(private readonly sessions: CustomerSessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppAuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = authorization.slice('Bearer '.length);
    if (token.length === 0 || token.length > 4096) throw new UnauthorizedException();
    request.principal = await this.sessions.authenticateAccess(token);
    return true;
  }
}

export const CurrentAppPrincipal = createParamDecorator((_data: unknown, context): AppPrincipal => {
  const request = context.switchToHttp().getRequest<AppAuthenticatedRequest>();
  if (request.principal === undefined) throw new UnauthorizedException();
  return request.principal;
});
