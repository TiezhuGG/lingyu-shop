import { BadRequestException, CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { BackendConfigService } from '../foundation/config';
import type { RequestIdRequest } from '../foundation/http-boundary';
import { AdminService, type AdminPrincipal } from './service';
import { adminCsrf, safeEqual } from './security';

interface AdminRequest extends RequestIdRequest {
  method: string;
  principal?: AdminPrincipal;
  adminCookie?: string;
}
export const adminCookieName = (production: boolean): string => production ? '__Host-lingyu-admin' : 'lingyu_admin';
export function readAdminCookie(header: unknown, production: boolean): string {
  if (typeof header !== 'string') throw new UnauthorizedException();
  const matches = header.split(';').map(part => part.trim()).filter(part => part.startsWith(adminCookieName(production) + '='));
  if (matches.length !== 1) throw new UnauthorizedException();
  return matches[0]!.slice(matches[0]!.indexOf('=') + 1);
}
export function serializeAdminCookie(cookie: string, production: boolean, clear = false): string {
  return `${adminCookieName(production)}=${clear ? '' : cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 28800}${production ? '; Secure' : ''}`;
}

@Injectable()
export class AdminOriginGuard implements CanActivate {
  constructor(private readonly config: BackendConfigService, private readonly admins: AdminService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (request.headers.origin !== this.config.values.adminOrigin || request.headers['sec-fetch-site'] === 'cross-site') {
      await this.admins.recordRequestRejected(request.requestId, 'origin');
      throw new ForbiddenException();
    }
    if (typeof request.headers['content-type'] !== 'string' || !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'])) throw new BadRequestException();
    return true;
  }
}

@Injectable()
export class AdminAuthenticationGuard implements CanActivate {
  constructor(private readonly config: BackendConfigService, private readonly admins: AdminService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const cookie = readAdminCookie(request.headers.cookie, this.config.values.environment === 'production');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.headers.origin !== this.config.values.adminOrigin || request.headers['sec-fetch-site'] === 'cross-site') {
        await this.admins.recordRequestRejected(request.requestId, 'origin');
        throw new ForbiddenException();
      }
      const csrf = request.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || !safeEqual(adminCsrf(cookie), csrf)) {
        await this.admins.recordRequestRejected(request.requestId, 'csrf');
        throw new ForbiddenException();
      }
    }
    request.principal = await this.admins.authenticate(cookie);
    request.adminCookie = cookie;
    return true;
  }
}
export const CurrentAdmin = createParamDecorator((_data: unknown, context): AdminPrincipal => {
  const request = context.switchToHttp().getRequest<AdminRequest>();
  if (!request.principal) throw new UnauthorizedException();
  return request.principal;
});
export const CurrentAdminCookie = createParamDecorator((_data: unknown, context): string => {
  const request = context.switchToHttp().getRequest<AdminRequest>();
  if (!request.adminCookie) throw new UnauthorizedException();
  return request.adminCookie;
});
