import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminAuthenticationGuard, CurrentAdmin } from '../admin/http';
import type { AdminPrincipal } from '../admin/service';
import { RequestId } from '../foundation/http-boundary';
import { TextCmsService } from './service';
@Controller('api/v1/app/cms')
export class PublicTextCmsController {
  constructor(private readonly cms: TextCmsService) {}
  @Get(':pageCode')
  async read(@Param('pageCode') code: string, @Query() query: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.cms.publicPage(code, query), requestId }; }
}
@Controller('api/v1/admin/cms')
@UseGuards(AdminAuthenticationGuard)
export class AdminTextCmsController {
  constructor(private readonly cms: TextCmsService) {}
  @Get(':pageCode')
  async read(@CurrentAdmin() principal: AdminPrincipal, @Param('pageCode') code: string, @Query() query: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.cms.read(principal, code, query, requestId), requestId }; }
  @Put(':pageCode')
  async save(@CurrentAdmin() principal: AdminPrincipal, @Param('pageCode') code: string, @Body() input: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.cms.save(principal, code, input, requestId), requestId }; }
  @Post(':pageCode/publish') @HttpCode(200)
  async publish(@CurrentAdmin() principal: AdminPrincipal, @Param('pageCode') code: string, @Body() input: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.cms.change(principal, code, input, 'publish', requestId), requestId }; }
  @Post(':pageCode/rollback') @HttpCode(200)
  async rollback(@CurrentAdmin() principal: AdminPrincipal, @Param('pageCode') code: string, @Body() input: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.cms.change(principal, code, input, 'rollback', requestId), requestId }; }
  @Post(':pageCode/withdraw') @HttpCode(200)
  async withdraw(@CurrentAdmin() principal: AdminPrincipal, @Param('pageCode') code: string, @Body() input: unknown, @RequestId() requestId: string) { return { code: 'OK', data: await this.cms.change(principal, code, input, 'withdraw', requestId), requestId }; }
}
