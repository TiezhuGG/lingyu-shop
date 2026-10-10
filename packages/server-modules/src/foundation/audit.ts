import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated';
import { AuditActorType, AuditSource as PrismaAuditSource } from '../../generated';
import { TransactionContext } from './transaction';

export type AuditSource = 'API' | 'WORKER';
export type AuditActorTypeValue = 'SYSTEM' | 'CUSTOMER' | 'ADMIN';
type AuditScalar = string | number | boolean | null;
export interface AuditAppendInput {
  readonly actor?: { readonly type: AuditActorTypeValue; readonly id?: string };
  readonly action: string;
  readonly objectType: string;
  readonly objectId: string;
  readonly requestId?: string;
  readonly idempotencyKey?: string;
  readonly changes?: Readonly<Record<string, AuditScalar>>;
}
export type AuditAppender = (input: AuditAppendInput) => Promise<string>;

const safeToken = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const requestIdToken = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/;
const prohibitedChangeKey = /(?:password|secret|token|credential|address|phone|email|payment|card)/i;

function token(value: string, field: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || !safeToken.test(value)) throw new TypeError(`Invalid audit ${field}`);
  return value;
}

function changes(input: AuditAppendInput['changes']): Prisma.InputJsonValue | undefined {
  if (input === undefined) return undefined;
  const entries = Object.entries(input);
  if (entries.length > 12) throw new TypeError('Invalid audit changes');
  const result: Record<string, AuditScalar> = {};
  for (const [key, value] of entries) {
    if (!/^[a-z][A-Za-z0-9_]{0,63}$/.test(key) || prohibitedChangeKey.test(key)) throw new TypeError('Invalid audit changes');
    if (typeof value === 'string' && value.length > 128) throw new TypeError('Invalid audit changes');
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') throw new TypeError('Invalid audit changes');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Invalid audit changes');
    result[key] = value;
  }
  return result;
}

function source(value: AuditSource): PrismaAuditSource {
  return value === 'API' ? PrismaAuditSource.API : PrismaAuditSource.WORKER;
}

function actorType(value: AuditActorTypeValue): AuditActorType {
  if (value === 'SYSTEM') return AuditActorType.SYSTEM;
  if (value === 'CUSTOMER') return AuditActorType.CUSTOMER;
  if (value === 'ADMIN') return AuditActorType.ADMIN;
  throw new TypeError('Invalid audit actor');
}

export function createAuditAppender(client: Prisma.TransactionClient, auditSource: AuditSource): AuditAppender {
  return async input => {
    const actor = input.actor;
    const actorId = actor?.id === undefined ? null : token(actor.id, 'actorId', 128);
    if (input.requestId !== undefined && !requestIdToken.test(input.requestId)) throw new TypeError('Invalid audit requestId');
    const id = randomUUID();
    await client.auditLog.create({ data: {
      id,
      source: source(auditSource),
      actorType: actor === undefined ? null : actorType(actor.type),
      actorId,
      action: token(input.action, 'action', 100),
      objectType: token(input.objectType, 'objectType', 100),
      objectId: token(input.objectId, 'objectId', 128),
      requestId: input.requestId ?? null,
      idempotencyKey: input.idempotencyKey === undefined ? null : token(input.idempotencyKey, 'idempotencyKey', 128),
      changes: changes(input.changes),
    } });
    return id;
  };
}

@Injectable()
export class AuditService {
  append(context: TransactionContext, input: AuditAppendInput): Promise<string> {
    return context.appendAudit(input);
  }
}
