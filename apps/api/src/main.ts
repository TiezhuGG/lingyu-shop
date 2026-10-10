import 'reflect-metadata';
import { Body, Controller, Get, HttpCode, Module, Post, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseService, FoundationModule, HttpBoundaryFilter, installShutdown, parseBackendConfig, parseContractProbe, RequestId, requestIdMiddleware } from '@lingyu/server-modules';

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
async function main(): Promise<void> {
  const config = parseBackendConfig(process.env);
  @Module({ imports: [FoundationModule.register('api', config)], controllers: [HealthController, ContractProbeController] })
  class AppModule {}
  const app = await NestFactory.create(AppModule, { abortOnError: false, logger: false });
  app.use(requestIdMiddleware);
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
