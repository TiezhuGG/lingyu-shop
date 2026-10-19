import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminAuthenticationGuard, CurrentAdmin } from '../admin/http';
import type { AdminPrincipal } from '../admin/service';
import { RequestId } from '../foundation/http-boundary';
import { StorefrontService } from './service';
@Controller('api/v1/app/storefront')
export class PublicStorefrontController {
  constructor(private readonly storefront: StorefrontService) {}
  @Get()
  async read(@RequestId() requestId: string) { return { code: 'OK', data: await this.storefront.publicSettings(), requestId }; }
}
@Controller('api/v1/admin/storefront')
@UseGuards(AdminAuthenticationGuard)
export class AdminStorefrontController {
  constructor(private readonly storefront: StorefrontService) {}
  @Get()
  async read(@CurrentAdmin() principal: AdminPrincipal, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.storefront.adminSettings(principal, requestId), requestId };
  }
  @Put()
  async save(@CurrentAdmin() principal: AdminPrincipal, @Body() input: unknown, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.storefront.save(principal, input, requestId), requestId };
  }
}
