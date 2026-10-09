import { DynamicModule, Module } from '@nestjs/common';
import { BackendConfig, BackendConfigService, ServiceName } from './config';
import { DatabaseService } from './database';
@Module({})
export class FoundationModule {
  static register(service: ServiceName, values: BackendConfig): DynamicModule {
    return {
      module: FoundationModule,
      providers: [
        { provide: BackendConfigService, useValue: new BackendConfigService(values, service) },
        DatabaseService,
      ],
      exports: [BackendConfigService, DatabaseService],
    };
  }
}
