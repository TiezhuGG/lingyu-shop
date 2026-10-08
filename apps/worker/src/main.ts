import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
@Module({}) class WorkerModule {}
async function main() {
 const app = await NestFactory.createApplicationContext(WorkerModule);
 app.enableShutdownHooks();
 console.log('Worker engineering context initialized; no jobs registered.');
 if (process.env.WORKER_SMOKE === '1') await app.close();
 else { const keepAlive = setInterval(() => {}, 60000); for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => clearInterval(keepAlive)); }
}
void main();
