// UI preview only; these records are not catalog, stock or customer facts.
export const topics = ['推荐', '关注', '穿搭', '美食', '好物'];
export const categories = ['精选好物', '时令鲜果', '日常食品', '生活用品'];
export const stories = [
  { id: 'preview-1', title: '把日常过成喜欢的样子', topic: '好物', art: '杯', tone: 'sand', author: '示例作者 · 小禾' },
  { id: 'preview-2', title: '一份简单又丰盛的早餐', topic: '美食', art: '早餐', tone: 'peach', author: '示例作者 · 阿青' },
  { id: 'preview-3', title: '周末，给生活一点绿意', topic: '好物', art: '叶', tone: 'mint', author: '示例作者 · 木木' },
  { id: 'preview-4', title: '轻松出门的春日搭配', topic: '穿搭', art: '春日', tone: 'lavender', author: '示例作者 · 小林' },
  { id: 'preview-5', title: '新鲜的食材，温暖的一餐', topic: '美食', art: '鲜', tone: 'mint', author: '示例作者 · 阿青' },
  { id: 'preview-6', title: '收集属于自己的小美好', topic: '好物', art: '日常', tone: 'sand', author: '示例作者 · 小禾' },
];
export const products = [
  { id: 'preview-p1', name: '清甜时令橙', detail: '示例规格 · 约 500g / 份', category: '时令鲜果', priceMinor: 1290, art: '橙', tone: 'peach' },
  { id: 'preview-p2', name: '早餐原味燕麦', detail: '示例规格 · 400g / 袋', category: '日常食品', priceMinor: 2490, art: '麦', tone: 'sand' },
  { id: 'preview-p3', name: '简约日常马克杯', detail: '示例规格 · 350ml / 个', category: '生活用品', priceMinor: 3900, art: '杯', tone: 'mint' },
  { id: 'preview-p4', name: '新鲜红苹果', detail: '示例规格 · 约 500g / 份', category: '时令鲜果', priceMinor: 1590, art: '果', tone: 'peach' },
  { id: 'preview-p5', name: '全麦早餐面包', detail: '示例规格 · 300g / 袋', category: '日常食品', priceMinor: 1890, art: '麦', tone: 'sand' },
  { id: 'preview-p6', name: '轻巧随行布袋', detail: '示例规格 · 1 个', category: '生活用品', priceMinor: 2900, art: '袋', tone: 'lavender' },
];
export type PreviewProduct = (typeof products)[number];
export type PreviewStory = (typeof stories)[number];
// Integer minor-unit display only, not settlement calculation.
export function previewPrice(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error('Invalid preview price');
  const digits = String(minor).padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
