export type ShopDisplayItem = { id: string; active: boolean; sort: number };
export function visibleShopItems<T extends ShopDisplayItem>(items: T[], limit: number): T[] {
  return items.filter(item => item.active).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)).slice(0, Math.max(0, limit));
}