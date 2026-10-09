import 'reflect-metadata';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseService, FoundationModule, installShutdown, parseBackendConfig } from '@lingyu/server-modules';

@Controller('health')
class HealthController {
  constructor(private readonly database: DatabaseService) {}
  @Get() health() { return { status: 'ok', service: 'api', scope: 'engineering' }; }
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready') async ready() {
    if (!await this.database.isReady()) throw new ServiceUnavailableException('Service not ready');
    return { status: 'ready' };
  }
}
async function main(): Promise<void> {
  const config = parseBackendConfig(process.env);
  @Module({ imports: [FoundationModule.register('api', config)], controllers: [HealthController] })
  class AppModule {}
  const app = await NestFactory.create(AppModule, { abortOnError: false, logger: false });
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
