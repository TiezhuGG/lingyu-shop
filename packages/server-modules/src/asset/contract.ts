import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { parseContractInput } from '../foundation/contract-input';
export const parseAssetIssue = (input: unknown) => parseContractInput('AssetIssueRequest', input);
export const parseAssetRevoke = (input: unknown) => parseContractInput('AssetRevokeRequest', input);
export const parseAssetEmpty = (input: unknown) => parseContractInput('AssetEmptyRequest', input);
export const parseAssetList = (input: unknown) => parseContractInput('AssetListQuery', input);
export function parseAssetId(id: unknown): string {
  if (typeof id !== 'string') throw new BadRequestException();
  return parseContractInput('AssetListQuery', { before: id }).before!;
}
export function parseAssetBytes(input: unknown): Buffer {
  const { dataBase64 } = parseContractInput('AssetBytesRequest', input);
  const bytes = Buffer.from(dataBase64, 'base64');
  if (bytes.length === 0 || bytes.length > 2097152 || bytes.toString('base64') !== dataBase64) throw new BadRequestException();
  return bytes;
}
export const imageDigest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
