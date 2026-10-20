import { BadRequestException } from '@nestjs/common';
import { parseContractInput } from '../foundation/contract-input';
export const parseCmsPageCode = (value: unknown) => parseContractInput('CmsPageCode', value);
export function parseCmsSave(value: unknown) {
  const input = parseContractInput('CmsSaveRequest', value);
  return { ...input, title: input.title.trim(), body: input.body.trim() };
}
export const parseCmsPublication = (value: unknown) => parseContractInput('CmsPublicationRequest', value);
export const parseCmsRollback = (value: unknown) => parseContractInput('CmsRollbackRequest', value);
export function parseCmsHistory(value: unknown) {
  const input = parseContractInput('CmsHistoryQuery', value);
  const before = input.before === undefined ? undefined : Number(input.before);
  if (before !== undefined && before > 2147483647) throw new BadRequestException();
  return before;
}
export const parseCmsPublicQuery = (value: unknown) => parseContractInput('CmsEmptyQuery', value);
