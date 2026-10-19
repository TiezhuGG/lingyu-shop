import { BadRequestException } from '@nestjs/common';
import { parseContractInput } from '../foundation/contract-input';
export const parseCatalogId = (input: unknown) => parseContractInput('CatalogId', input);
export const parseCatalogPublication = (input: unknown) => parseContractInput('CatalogPublicationRequest', input);
export function parseCatalogPage(input: unknown) {
  const value = parseContractInput('CatalogPageRequest', input);
  return { cursor: value.cursor, limit: value.limit === undefined ? 20 : Number(value.limit) };
}
function text(value: string): string {
  const normalized = value.normalize('NFKC').trim();
  if (!normalized) throw new BadRequestException();
  return normalized;
}
export function parseCatalogCategory(input: unknown) {
  const value = parseContractInput('CatalogCategoryRequest', input);
  return parseContractInput('CatalogCategoryRequest', { ...value, name: text(value.name) });
}
export function parseCatalogProduct(input: unknown) {
  const value = parseContractInput('CatalogProductRequest', input);
  const skus = value.skus.map(sku => ({ ...sku, options: sku.options.map(option => ({ name: text(option.name), value: text(option.value) }))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0) }));
  const ids = new Set<string>(), codes = new Set<string>(), combinations = new Set<string>();
  const axes = JSON.stringify(skus[0]!.options.map(option => option.name));
  for (const sku of skus) {
    const combination = JSON.stringify(sku.options);
    if (ids.has(sku.id) || codes.has(sku.code) || combinations.has(combination) ||
        new Set(sku.options.map(option => option.name)).size !== sku.options.length ||
        JSON.stringify(sku.options.map(option => option.name)) !== axes) throw new BadRequestException();
    ids.add(sku.id); codes.add(sku.code); combinations.add(combination);
  }
  // Revalidate lengths/patterns after Unicode normalization, not only before it.
  return parseContractInput('CatalogProductRequest', { ...value, name: text(value.name), description: value.description.trim(), skus });
}
