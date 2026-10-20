import { BadRequestException } from '@nestjs/common';
import type { components } from '@lingyu/contracts';
export type AdminGrantInput = components['schemas']['AdminGrantInput'];
export type AdminPermission = 'iam.admin.read' | 'iam.admin.manage' | 'audit.read' | 'store.read' | 'store.configure' | 'catalog.read' | 'catalog.write' | 'catalog.sku.publish' | 'cms.read' | 'cms.write' | 'cms.publish';
const permissions: Record<AdminGrantInput['role'], readonly AdminPermission[]> = {
  IAM_MANAGER: ['iam.admin.read', 'iam.admin.manage', 'audit.read'],
  STORE_OPERATOR: ['store.read', 'store.configure', 'catalog.read', 'catalog.write', 'catalog.sku.publish', 'cms.read', 'cms.write', 'cms.publish'],
  STORE_READER: ['store.read', 'catalog.read', 'cms.read'],
};
const storeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validateAdminGrants(grants: readonly AdminGrantInput[]): void {
  const seen = new Set<string>();
  if (grants.length > 30) throw new BadRequestException();
  for (const grant of grants) {
    const key = grant.role + ':' + grant.scopeKey;
    if (!Object.hasOwn(permissions, grant.role) || seen.has(key) ||
        (grant.role === 'IAM_MANAGER' ? grant.scopeKey !== 'GLOBAL' : !storeId.test(grant.scopeKey))) throw new BadRequestException();
    seen.add(key);
  }
}
export function hasAdminPermission(grants: readonly AdminGrantInput[], permission: AdminPermission, scope?: string): boolean {
  return grants.some(grant => permissions[grant.role]?.includes(permission) &&
    (grant.role === 'IAM_MANAGER' ? scope === undefined && grant.scopeKey === 'GLOBAL' : scope !== undefined && storeId.test(scope) && scope === grant.scopeKey));
}
