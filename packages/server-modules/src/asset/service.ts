import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { components } from '@lingyu/contracts';
import type { AssetUpload } from '../../generated';
import { AdminService, type AdminPrincipal } from '../admin/service';
import type { AdminPermission } from '../admin/policy';
import { BackendConfigService } from '../foundation/config';
import { AuditService } from '../foundation/audit';
import { DatabaseService } from '../foundation/database';
import { transactionClientFor, type TransactionContext } from '../foundation/transaction';
import { onlineSalesScopeId, StorefrontService } from '../store/service';
import { LocalImageStore } from './local-image-store';
import { ImageInspectionPort } from './inspection';
import { imageDigest, parseAssetBytes, parseAssetEmpty, parseAssetId, parseAssetIssue, parseAssetList, parseAssetRevoke } from './contract';

type S = components['schemas'];
function data(row: AssetUpload): S['AssetData'] {
  return { id: row.id, purpose: 'CMS_IMAGE', mime: row.mime as S['AssetData']['mime'], size: row.size, status: row.status as S['AssetData']['status'],
    version: row.version, width: row.width, height: row.height, expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString(), developmentOnly: true };
}
@Injectable()
export class AssetService {
  private working = 0;
  constructor(private readonly config: BackendConfigService, private readonly database: DatabaseService, private readonly admins: AdminService,
    private readonly audit: AuditService, private readonly storefront: StorefrontService, private readonly inspection: ImageInspectionPort) {}
  private store() {
    const { environment, assetDirectory } = this.config.values;
    if (process.env.NODE_ENV === 'production' || environment === 'production' || !assetDirectory) throw new ServiceUnavailableException();
    return new LocalImageStore(environment, assetDirectory);
  }
  private async run<T>(principal: AdminPrincipal, permission: AdminPermission, id: string, requestId: string | undefined, operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    this.store(); // Gate before touching DB or files; construction creates no directory.
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.database.runInTransaction(async context => {
            await this.admins.authorizeInTransaction(context, principal, permission, onlineSalesScopeId);
            return operation(context);
          });
        } catch (error) {
          // A first-create unique race must re-read the winner in a new transaction.
          if ((error as { code?: string })?.code === 'P2002' && attempt === 0) continue;
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof HttpException) await this.database.runInTransaction(context => this.audit.append(context, {
        actor: { type: 'ADMIN', id: principal.adminId }, action: 'asset.rejected', objectType: 'asset', objectId: id, requestId,
        changes: { permission, result: error.getStatus(), storeId: onlineSalesScopeId },
      }));
      throw error;
    }
  }
  private async own(context: TransactionContext, principal: AdminPrincipal, id: string) {
    const client = transactionClientFor(context);
    await client.$queryRaw`SELECT id FROM asset_upload WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await client.assetUpload.findUnique({ where: { id } });
    if (!row || row.ownerId !== principal.adminId || row.storeId !== onlineSalesScopeId) throw new NotFoundException();
    return row;
  }
  private active(row: AssetUpload) {
    if (row.status === 'REVOKED' || (row.status !== 'DEVELOPMENT_READY' && row.expiresAt <= new Date())) throw new ConflictException();
  }
  private event(context: TransactionContext, principal: AdminPrincipal, row: AssetUpload, action: string, requestId?: string) {
    return this.audit.append(context, { actor: { type: 'ADMIN', id: principal.adminId }, action: 'asset.' + action, objectType: 'asset', objectId: row.id, requestId,
      changes: { storeId: row.storeId, version: row.version, status: row.status, size: row.size, developmentOnly: true } });
  }
  private async work<T>(operation: () => Promise<T>) {
    if (this.working >= 2) throw new HttpException('Too many requests', 429);
    this.working++;
    try { return await operation(); } finally { this.working--; }
  }
  issue(principal: AdminPrincipal, raw: unknown, requestId?: string): Promise<S['AssetData']> {
    const input = parseAssetIssue(raw);
    return this.run(principal, 'asset.upload', input.uploadId, requestId, async context => {
      const client = transactionClientFor(context), existing = await client.assetUpload.findUnique({ where: { id: input.uploadId } });
      if (existing) {
        if (existing.ownerId !== principal.adminId || existing.storeId !== onlineSalesScopeId) throw new NotFoundException();
        if (existing.mime !== input.mime || existing.size !== input.size || existing.sha256 !== input.sha256 || existing.purpose !== input.purpose) throw new ConflictException();
        this.active(existing); return data(existing);
      }
      if (!(await this.storefront.readInTransaction(context)).configured) throw new ConflictException();
      const quota = await client.assetUpload.aggregate({ where: { storeId: onlineSalesScopeId }, _count: true, _sum: { size: true } });
      if (quota._count >= 100 || (quota._sum.size ?? 0) + input.size > 67108864) throw new HttpException('Quota exceeded', 429);
      const row = await client.assetUpload.create({ data: { id: input.uploadId, storeId: onlineSalesScopeId, ownerId: principal.adminId,
        purpose: input.purpose, mime: input.mime, size: input.size, sha256: input.sha256, expiresAt: new Date(Date.now() + 600000) } });
      await this.event(context, principal, row, 'issued', requestId); return data(row);
    });
  }
  list(principal: AdminPrincipal, raw: unknown = {}, requestId?: string): Promise<S['AssetPage']> {
    const query = parseAssetList(raw);
    return this.run(principal, 'asset.read', 'list', requestId, async context => {
      const rows = await transactionClientFor(context).assetUpload.findMany({ where: { storeId: onlineSalesScopeId, ownerId: principal.adminId,
        ...(query.before ? { id: { lt: query.before } } : {}) }, orderBy: { id: 'desc' }, take: 11 });
      return { items: rows.slice(0, 10).map(data), nextCursor: rows.length > 10 ? rows[9]!.id : null };
    });
  }
  read(principal: AdminPrincipal, rawId: unknown, requestId?: string) {
    const id = parseAssetId(rawId);
    return this.run(principal, 'asset.read', id, requestId, async context => data(await this.own(context, principal, id)));
  }
  async upload(principal: AdminPrincipal, rawId: unknown, raw: unknown, requestId?: string): Promise<S['AssetData']> {
    const id = parseAssetId(rawId), bytes = parseAssetBytes(raw);
    const check = (row: AssetUpload) => {
      this.active(row);
      if (row.size !== bytes.length || row.sha256 !== imageDigest(bytes)) throw new ConflictException();
      const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR';
      const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
      if (row.mime === 'image/png' ? !png : !jpeg) throw new BadRequestException();
    };
    const initial = await this.run(principal, 'asset.upload', id, requestId, async context => { const row = await this.own(context, principal, id); check(row); return row; });
    if (initial.status !== 'ISSUED') return data(initial);
    return this.work(async () => {
      const stored = await this.store().put(bytes, initial.mime as 'image/png' | 'image/jpeg');
      return this.run(principal, 'asset.upload', id, requestId, async context => {
        const row = await this.own(context, principal, id); check(row);
        if (row.status !== 'ISSUED') return data(row);
        const changed = await transactionClientFor(context).assetUpload.update({ where: { id, version: row.version }, data: { rawKey: stored.key, status: 'STORED', version: { increment: 1 } } });
        await this.event(context, principal, changed, 'stored', requestId); return data(changed);
      });
    });
  }
  async confirm(principal: AdminPrincipal, rawId: unknown, raw: unknown, requestId?: string): Promise<S['AssetData']> {
    const id = parseAssetId(rawId); parseAssetEmpty(raw);
    const initial = await this.run(principal, 'asset.upload', id, requestId, async context => {
      const row = await this.own(context, principal, id); this.active(row);
      if (row.status === 'ISSUED') throw new ConflictException(); return row;
    });
    if (initial.status === 'DEVELOPMENT_READY') return data(initial);
    return this.work(async () => {
      const image = await this.inspection.inspect(await this.store().read(initial.rawKey!), initial.mime);
      if (image.developmentOnly !== true) throw new ServiceUnavailableException();
      const stored = await this.store().put(image.bytes, 'image/png');
      return this.run(principal, 'asset.upload', id, requestId, async context => {
        const row = await this.own(context, principal, id); this.active(row);
        if (row.status === 'DEVELOPMENT_READY') return data(row);
        if (row.status !== 'STORED' || row.rawKey !== initial.rawKey) throw new ConflictException();
        const changed = await transactionClientFor(context).assetUpload.update({ where: { id, version: row.version }, data: {
          readyKey: stored.key, width: image.width, height: image.height, status: 'DEVELOPMENT_READY', version: { increment: 1 },
        } });
        await this.event(context, principal, changed, 'development_confirmed', requestId); return data(changed);
      });
    });
  }
  revoke(principal: AdminPrincipal, rawId: unknown, raw: unknown, requestId?: string) {
    const id = parseAssetId(rawId), input = parseAssetRevoke(raw);
    return this.run(principal, 'asset.revoke', id, requestId, async context => {
      const row = await this.own(context, principal, id);
      if (row.status === 'REVOKED' && row.version === input.version + 1) return data(row);
      if (row.status === 'REVOKED' || row.version !== input.version) throw new ConflictException();
      const changed = await transactionClientFor(context).assetUpload.update({ where: { id, version: input.version }, data: { status: 'REVOKED', version: { increment: 1 } } });
      await this.event(context, principal, changed, 'revoked', requestId); return data(changed);
    });
  }
  async content(principal: AdminPrincipal, rawId: unknown, requestId?: string) {
    const id = parseAssetId(rawId);
    const initial = await this.run(principal, 'asset.read', id, requestId, context => this.own(context, principal, id));
    if (initial.status !== 'DEVELOPMENT_READY' || !initial.readyKey) throw new NotFoundException();
    const bytes = await this.store().read(initial.readyKey);
    await this.run(principal, 'asset.read', id, requestId, async context => {
      const row = await this.own(context, principal, id);
      if (row.status !== 'DEVELOPMENT_READY' || row.version !== initial.version) throw new NotFoundException();
    });
    return bytes;
  }
  /** CMS calls this inside its transaction; no file access or cross-module table writes. */
  async requireDevelopmentImageInTransaction(context: TransactionContext, rawId: unknown, storeId: string): Promise<{ assetId: string; developmentOnly: true }> {
    this.store(); const id = parseAssetId(rawId);
    const row = await transactionClientFor(context).assetUpload.findUnique({ where: { id } });
    if (!row || row.storeId !== storeId || row.purpose !== 'CMS_IMAGE' || row.status !== 'DEVELOPMENT_READY') throw new ConflictException();
    return { assetId: row.id, developmentOnly: true };
  }
}
