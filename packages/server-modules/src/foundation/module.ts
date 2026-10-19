import { DynamicModule, Module } from '@nestjs/common';
import { BackendConfig, BackendConfigService, ServiceName } from './config';
import { DatabaseService } from './database';
import { AuditService } from './audit';
import { AppAuthenticationGuard } from '../identity/http';
import { CustomerSessionService } from '../identity/service';
import { AdminService } from '../admin/service';
import { AdminAuthenticationGuard, AdminOriginGuard } from '../admin/http';
import { StorefrontService } from '../store/service';
import { CatalogService } from '../catalog/service';
import { PricingService } from '../pricing/service';
@Module({})
export class FoundationModule {
  static register(service: ServiceName, values: BackendConfig): DynamicModule {
    return {
      module: FoundationModule,
      providers: [
        { provide: BackendConfigService, useValue: new BackendConfigService(values, service) },
        DatabaseService,
        AuditService,
        CustomerSessionService,
        AppAuthenticationGuard,
        AdminService,
        AdminAuthenticationGuard,
        AdminOriginGuard,
        StorefrontService,
        CatalogService,
        PricingService,
      ],
      exports: [BackendConfigService, DatabaseService, AuditService, CustomerSessionService, AppAuthenticationGuard, AdminService, AdminAuthenticationGuard, AdminOriginGuard, StorefrontService, CatalogService, PricingService],
    };
  }
}
