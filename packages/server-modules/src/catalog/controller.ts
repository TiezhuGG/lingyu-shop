import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminAuthenticationGuard, CurrentAdmin } from '../admin/http';
import type { AdminPrincipal } from '../admin/service';
import { RequestId } from '../foundation/http-boundary';
import { CatalogService } from './service';
@Controller('api/v1/app/products')
export class PublicCatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get()
  async list(@Query() query: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.catalog.publicList(query), requestId }; }
}
@Controller('api/v1/admin/catalog')
@UseGuards(AdminAuthenticationGuard)
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get()
  async list(@CurrentAdmin() principal: AdminPrincipal, @Query() query: unknown, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.catalog.list(principal, query, requestId), requestId };
  }
  @Get('products/:id')
  async get(@CurrentAdmin() principal: AdminPrincipal, @Param('id') id: string, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.catalog.get(principal, id, requestId), requestId };
  }
  @Put('categories/:id')
  async category(@CurrentAdmin() principal: AdminPrincipal, @Param('id') id: string, @Body() input: unknown, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.catalog.saveCategory(principal, id, input, requestId), requestId };
  }
  @Put('products/:id')
  async save(@CurrentAdmin() principal: AdminPrincipal, @Param('id') id: string, @Body() input: unknown, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.catalog.save(principal, id, input, requestId), requestId };
  }
  @Post('products/:id/publish') @HttpCode(200)
  async publish(@CurrentAdmin() principal: AdminPrincipal, @Param('id') id: string, @Body() input: unknown, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.catalog.publication(principal, id, input, true, requestId), requestId };
  }
  @Post('products/:id/withdraw') @HttpCode(200)
  async withdraw(@CurrentAdmin() principal: AdminPrincipal, @Param('id') id: string, @Body() input: unknown, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.catalog.publication(principal, id, input, false, requestId), requestId };
  }
}
