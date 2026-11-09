import { describe, expect, it } from "vitest";
import { visibleShopItems } from "./shop-display";
describe("shop display", () => {
  const items = [{ id: "a", active: true, sort: 3 }, { id: "b", active: false, sort: 1 }, { id: "c", active: true, sort: 2 }];
  it("removes hidden items", () => expect(visibleShopItems(items, 100).map(i => i.id)).toEqual(["c", "a"]));
  it("limits displayed quantity", () => expect(visibleShopItems(items, 1).map(i => i.id)).toEqual(["c"]));
  it("allows empty storefront", () => expect(visibleShopItems(items, 0)).toEqual([]));
});