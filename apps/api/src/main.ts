import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
@Controller('health')
class HealthController { @Get() health() { return { status: 'ok', service: 'api', scope: 'engineering' }; } }
@Module({ controllers: [HealthController] })
class AppModule {}
async function main() { const app = await NestFactory.create(AppModule); app.enableShutdownHooks(); await app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1'); }
void main();
