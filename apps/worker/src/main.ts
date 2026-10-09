import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FoundationModule, installShutdown, parseBackendConfig } from '@lingyu/server-modules';

async function main(): Promise<void> {
  const config = parseBackendConfig(process.env);
  @Module({ imports: [FoundationModule.register('worker', config)] })
  class WorkerModule {}
  const app = await NestFactory.createApplicationContext(WorkerModule, { abortOnError: false, logger: false });
  const keepAlive = setInterval(() => {}, 60000);
  const close = installShutdown(app, async () => { clearInterval(keepAlive); });
  console.log('Worker database ready; no jobs registered.');
  if (process.env.WORKER_SMOKE === '1' && config.environment === 'test') await close();
}
void main().catch(error => {
  console.error(error instanceof Error && error.message.startsWith('Invalid configuration:') ? error.message : 'WORKER_STARTUP_FAILED');
  process.exitCode = 1;
});
