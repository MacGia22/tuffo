import { describe, expect, it } from "vitest";
import { products } from "@/engine/server";
import { CATALOG, catalogProduct } from "../catalog";

describe("catalog", () => {
  it("lists every engine product with the same physical form", () => {
    expect(CATALOG.map((p) => p.id).sort()).toEqual(Object.keys(products).sort());
    for (const item of CATALOG) {
      expect(item.form).toBe(products[item.id].form);
    }
  });

  it("finds products by id", () => {
    expect(catalogProduct("salt")?.short).toBe("pool salt");
    expect(catalogProduct("nope")).toBeUndefined();
  });
});
