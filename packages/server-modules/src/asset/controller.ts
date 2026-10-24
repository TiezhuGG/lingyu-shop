import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { AdminAuthenticationGuard, CurrentAdmin } from '../admin/http';
import type { AdminPrincipal } from '../admin/service';
import { RequestId } from '../foundation/http-boundary';
import { AssetService } from './service';
@Controller('api/v1/admin/assets')
@UseGuards(AdminAuthenticationGuard)
export class AdminAssetController {
  constructor(private readonly assets: AssetService) {}
  @Get()
  async list(@CurrentAdmin() principal: AdminPrincipal, @Query() query: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.assets.list(principal, query, requestId), requestId }; }
  @Post('upload-tickets') @HttpCode(200)
  async issue(@CurrentAdmin() principal: AdminPrincipal, @Body() input: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.assets.issue(principal, input, requestId), requestId }; }
  @Get(':id')
  async read(@CurrentAdmin() principal: AdminPrincipal, @Param('id') id: string, @RequestId() requestId: string) { return { code: 'OK', data: await this.assets.read(principal, id, requestId), requestId }; }
  @Post(':id/bytes') @HttpCode(200)
  async upload(@CurrentAdmin() principal: AdminPrincipal, @Param('id') id: string, @Body() input: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.assets.upload(principal, id, input, requestId), requestId }; }
  @Post(':id/confirm') @HttpCode(200)
  async confirm(@CurrentAdmin() principal: AdminPrincipal, @Param('id') id: string, @Body() input: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.assets.confirm(principal, id, input, requestId), requestId }; }
  @Post(':id/revoke') @HttpCode(200)
  async revoke(@CurrentAdmin() principal: AdminPrincipal, @Param('id') id: string, @Body() input: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.assets.revoke(principal, id, input, requestId), requestId }; }
  @Get(':id/content') @Header('x-content-type-options', 'nosniff') @Header('cache-control', 'no-store')
  async content(@CurrentAdmin() principal: AdminPrincipal, @Param('id') id: string, @RequestId() requestId: string) {
    return new StreamableFile(await this.assets.content(principal, id, requestId), { type: 'image/png', disposition: 'inline' });
  }
}
