import { describe, expect, it } from "vitest";
import { isStaff } from "./staff";

describe("staff tag", () => {
  it("shows the tag only for admin ids", () => {
    const staffIds = ["75ecb680-4220-4411-b0b6-ea981f102c2f"];
    expect(isStaff(staffIds, "75ecb680-4220-4411-b0b6-ea981f102c2f")).toBe(true);
    expect(isStaff(staffIds, "d4ccb4bb-978c-4205-9a36-8a5880bf069f")).toBe(false);
  });
  it("hides the tag when there is no user or no list", () => {
    expect(isStaff(undefined, "75ecb680-4220-4411-b0b6-ea981f102c2f")).toBe(false);
    expect(isStaff([], "75ecb680-4220-4411-b0b6-ea981f102c2f")).toBe(false);
    expect(isStaff(undefined, null)).toBe(false);
  });
});
