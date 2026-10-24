import 'reflect-metadata';
import { Body, Controller, Get, HttpCode, Module, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppAuthenticationGuard, CurrentAppPrincipal, CustomerSessionService, DatabaseService, FoundationModule, HttpBoundaryFilter, installShutdown, parseBackendConfig, parseContractProbe, parseDevelopmentLogin, parseRefreshSession, RequestId, requestIdMiddleware } from '@lingyu/server-modules';
import type { AppPrincipal } from '@lingyu/server-modules';
import { AdminAuthController, AdminIamController } from '@lingyu/server-modules';
import { PublicStorefrontController, AdminStorefrontController } from '@lingyu/server-modules';
import { PublicCatalogController, AdminCatalogController } from '@lingyu/server-modules';
import { PublicTextCmsController, AdminTextCmsController } from '@lingyu/server-modules';
import { AdminAssetController } from '@lingyu/server-modules';

@Controller('health')
class HealthController {
  constructor(private readonly database: DatabaseService) {}
  @Get() health(@RequestId() requestId: string) { return { status: 'ok', service: 'api', scope: 'engineering', requestId }; }
  @Get('live') live(@RequestId() requestId: string) { return { status: 'ok', requestId }; }
  @Get('ready') async ready(@RequestId() requestId: string) {
    if (!await this.database.isReady()) throw new ServiceUnavailableException('Service not ready');
    return { status: 'ready', requestId };
  }
}

@Controller('api/v1/_contract')
class ContractProbeController {
  @Post('probe')
  @HttpCode(200)
  probe(@Body() input: unknown, @RequestId() requestId: string) {
    const data = parseContractProbe(input);
    return { code: 'OK', data, requestId };
  }
}

@Controller('api/v1/app/auth')
class AppAuthenticationController {
  constructor(private readonly sessions: CustomerSessionService) {}

  @Post('development-login')
  @HttpCode(200)
  async developmentLogin(@Body() input: unknown, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.sessions.developmentLogin(parseDevelopmentLogin(input).developmentId, requestId), requestId };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() input: unknown, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.sessions.refresh(parseRefreshSession(input).refreshToken, requestId), requestId };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AppAuthenticationGuard)
  async logout(@CurrentAppPrincipal() principal: AppPrincipal, @RequestId() requestId: string) {
    await this.sessions.logout(principal, requestId);
    return { code: 'OK', data: {}, requestId };
  }

  @Get('me')
  @UseGuards(AppAuthenticationGuard)
  me(@CurrentAppPrincipal() principal: AppPrincipal, @RequestId() requestId: string) {
    return { code: 'OK', data: { customerId: principal.customerId, sessionId: principal.sessionId }, requestId };
  }
}
async function main(): Promise<void> {
  const config = parseBackendConfig(process.env);
  @Module({ imports: [FoundationModule.register('api', config)], controllers: [HealthController, ContractProbeController, AppAuthenticationController, AdminAuthController, AdminIamController, PublicStorefrontController, AdminStorefrontController, PublicCatalogController, AdminCatalogController, PublicTextCmsController, AdminTextCmsController, AdminAssetController] })
  class AppModule {}
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { abortOnError: false, logger: false });
  // JSON base64 transport is bounded at 2 MiB decoded; DTO limits still apply to other requests.
  app.useBodyParser('json', { limit: '3mb' });
  app.use(requestIdMiddleware);
  app.use('/api/v1/app/auth', (_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader('cache-control', 'no-store');
    next();
  });
  app.use('/api/v1/admin', (_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader('cache-control', 'no-store');
    next();
  });
  app.use('/api/v1/app/storefront', (_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader('cache-control', 'no-store'); next();
  });
  app.use('/api/v1/app/products', (_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader('cache-control', 'no-store'); next();
  });
  app.use('/api/v1/app/cms', (_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader('cache-control', 'no-store'); next();
  });
  app.useGlobalFilters(new HttpBoundaryFilter());
  const server = app.getHttpServer();
  const close = installShutdown(app, () => new Promise<void>((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close((error?: Error) => error ? reject(error) : resolve());
    server.closeIdleConnections?.();
  }));
  try { await app.listen(config.port, '127.0.0.1'); }
  catch { await close(); throw new Error('API_STARTUP_FAILED'); }
}
void main().catch(error => {
  console.error(error instanceof Error && error.message.startsWith('Invalid configuration:') ? error.message : 'API_STARTUP_FAILED');
  process.exitCode = 1;
});
