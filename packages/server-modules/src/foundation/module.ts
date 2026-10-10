import { DynamicModule, Module } from '@nestjs/common';
import { BackendConfig, BackendConfigService, ServiceName } from './config';
import { DatabaseService } from './database';
import { AuditService } from './audit';
@Module({})
export class FoundationModule {
  static register(service: ServiceName, values: BackendConfig): DynamicModule {
    return {
      module: FoundationModule,
      providers: [
        { provide: BackendConfigService, useValue: new BackendConfigService(values, service) },
        DatabaseService,
        AuditService,
      ],
      exports: [BackendConfigService, DatabaseService, AuditService],
    };
  }
}
