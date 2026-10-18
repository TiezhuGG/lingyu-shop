import { Body, Controller, Get, HttpCode, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { BackendConfigService } from '../foundation/config';
import { RequestId } from '../foundation/http-boundary';
import { parseAdminInput } from './contract';
import { AdminAuthenticationGuard, AdminOriginGuard, CurrentAdmin, CurrentAdminCookie, serializeAdminCookie } from './http';
import { AdminService, type AdminPrincipal } from './service';

interface CookieResponse { setHeader(name: string, value: string): void }
@Controller('api/v1/admin/auth')
export class AdminAuthController {
  constructor(private readonly admins: AdminService, private readonly config: BackendConfigService) {}
  @Post('login')
  @HttpCode(200)
  @UseGuards(AdminOriginGuard)
  async login(@Body() raw: unknown, @Res({ passthrough: true }) response: CookieResponse, @RequestId() requestId: string) {
    const input = parseAdminInput('AdminLoginRequest', raw);
    const result = await this.admins.login(input.username, input.password, requestId);
    response.setHeader('set-cookie', serializeAdminCookie(result.cookie, this.config.values.environment === 'production'));
    return { code: 'OK', data: result.data, requestId };
  }
  @Get('me')
  @UseGuards(AdminAuthenticationGuard)
  async me(@CurrentAdmin() principal: AdminPrincipal, @CurrentAdminCookie() cookie: string, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.admins.me(principal, cookie), requestId };
  }
  @Post('logout')
  @HttpCode(200)
  @UseGuards(AdminAuthenticationGuard)
  async logout(@CurrentAdmin() principal: AdminPrincipal, @Res({ passthrough: true }) response: CookieResponse, @RequestId() requestId: string) {
    await this.admins.logout(principal, requestId);
    response.setHeader('set-cookie', serializeAdminCookie('', this.config.values.environment === 'production', true));
    return { code: 'OK', data: {}, requestId };
  }
}

@Controller('api/v1/admin')
@UseGuards(AdminAuthenticationGuard)
export class AdminIamController {
  constructor(private readonly admins: AdminService) {}
  @Get('iam/admins')
  async list(@CurrentAdmin() principal: AdminPrincipal, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.admins.list(principal, requestId), requestId };
  }
  @Post('iam/admins')
  @HttpCode(200)
  async create(@CurrentAdmin() principal: AdminPrincipal, @Body() input: unknown, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.admins.create(principal, parseAdminInput('AdminCreateRequest', input), requestId), requestId };
  }
  @Patch('iam/admins/:id')
  async update(@CurrentAdmin() principal: AdminPrincipal, @Param('id') id: string, @Body() input: unknown, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.admins.update(principal, id, parseAdminInput('AdminUpdateRequest', input), requestId), requestId };
  }
  @Get('iam/audit')
  async audit(@CurrentAdmin() principal: AdminPrincipal, @RequestId() requestId: string) {
    return { code: 'OK', data: await this.admins.readAudit(principal, requestId), requestId };
  }
  @Get('_access/stores/:storeId')
  async access(@CurrentAdmin() principal: AdminPrincipal, @Param('storeId') storeId: string, @RequestId() requestId: string) {
    await this.admins.storeAccess(principal, storeId, 'store.read', requestId);
    return { code: 'OK', data: {}, requestId };
  }
}
