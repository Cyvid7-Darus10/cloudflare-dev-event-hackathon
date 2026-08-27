import type { Review } from "./types";

/**
 * One realistic review, hand-written.
 *
 * Build the screen against this. It is the whole point of shipping a fixture on
 * day one: this file is the contract made concrete, so the screen is finished
 * and demoable before extraction or the standard exist.
 *
 * The mix is deliberate. Real reconciliation is mostly agreement with a handful
 * of disagreements, and the disagreements are boring: a unit written two ways,
 * a trailing space, a rounded number. If the fixture is all dramatic conflicts
 * the screen will be designed for a case that does not happen.
 */
export const fixture: Review = {
  documentName: "northwind-catalogue-q3.pdf",
  customerName: "Northwind Trading Pte Ltd",
  receivedAt: "2026-08-27T09:14:00+08:00",
  flags: [
    {
      id: "f-001", sku: "NW-1042", productName: "Cold-pressed rapeseed oil, 5L",
      field: "unit", kind: "mismatch",
      customerValue: "5 litre", standardValue: "5L", state: "pending",
    },
    {
      id: "f-002", sku: "NW-1042", productName: "Cold-pressed rapeseed oil, 5L",
      field: "caseQuantity", kind: "mismatch",
      customerValue: "4", standardValue: "6", state: "pending",
    },
    {
      id: "f-003", sku: "NW-1187", productName: "Sea salt flakes, 250g",
      field: "name", kind: "mismatch",
      customerValue: "Sea Salt Flakes 250g", standardValue: "Sea salt flakes, 250g",
      state: "pending",
    },
    {
      id: "f-004", sku: "NW-1187", productName: "Sea salt flakes, 250g",
      field: "origin", kind: "unknown-field",
      customerValue: "Portugal", standardValue: null, state: "pending",
    },
    {
      id: "f-005", sku: "NW-2301", productName: "Ceramic pour-over cone",
      field: "material", kind: "mismatch",
      customerValue: "Stoneware", standardValue: "Ceramic", state: "pending",
    },
    {
      id: "f-006", sku: "NW-2301", productName: "Ceramic pour-over cone",
      field: "dimensions", kind: "mismatch",
      customerValue: "12.5 cm", standardValue: "12.5cm", state: "pending",
    },
    {
      id: "f-007", sku: "NW-2301", productName: "Ceramic pour-over cone",
      field: "warrantyMonths", kind: "missing",
      customerValue: null, standardValue: "24", state: "pending",
    },
    {
      id: "f-008", sku: "NW-3355", productName: "Linen tea towel, pack of 3",
      field: "packSize", kind: "mismatch",
      customerValue: "3", standardValue: "3 pack", state: "pending",
    },
    {
      id: "f-009", sku: "NW-3355", productName: "Linen tea towel, pack of 3",
      field: "colourway", kind: "unknown-field",
      customerValue: "Oatmeal / Slate / Chalk", standardValue: null, state: "pending",
    },
    {
      id: "f-010", sku: "NW-4102", productName: "Beeswax food wrap, medium",
      field: "description", kind: "mismatch",
      customerValue: "Reusable beeswax wrap. Washable up to 100 times.",
      standardValue: "Reusable beeswax food wrap, washable.", state: "pending",
    },
    {
      id: "f-011", sku: "NW-4102", productName: "Beeswax food wrap, medium",
      field: "unit", kind: "mismatch",
      customerValue: "each", standardValue: "ea", state: "pending",
    },
    {
      id: "f-012", sku: "NW-4102", productName: "Beeswax food wrap, medium",
      field: "hsCode", kind: "missing",
      customerValue: null, standardValue: "3924.90", state: "pending",
    },
    {
      id: "f-013", sku: "NW-5520", productName: "Enamel mug, 350ml",
      field: "capacity", kind: "mismatch",
      customerValue: "350ml", standardValue: "0.35L", state: "pending",
    },
    {
      id: "f-014", sku: "NW-5520", productName: "Enamel mug, 350ml",
      field: "dishwasherSafe", kind: "unknown-field",
      customerValue: "No", standardValue: null, state: "pending",
    },
    {
      id: "f-015", sku: "NW-6008", productName: "Cotton produce bag, large",
      field: "name", kind: "mismatch",
      customerValue: "Cotton Produce Bag (L)", standardValue: "Cotton produce bag, large",
      state: "pending",
    },
    {
      id: "f-016", sku: "NW-6008", productName: "Cotton produce bag, large",
      field: "weightGrams", kind: "mismatch",
      customerValue: "48", standardValue: "50", state: "pending",
    },
    {
      id: "f-017", sku: "NW-7741", productName: "Bamboo dish brush",
      field: "material", kind: "mismatch",
      customerValue: "Bamboo, sisal bristles", standardValue: "Bamboo / sisal",
      state: "pending",
    },
    {
      id: "f-018", sku: "NW-7741", productName: "Bamboo dish brush",
      field: "replacementHead", kind: "unknown-field",
      customerValue: "Yes", standardValue: null, state: "pending",
    },
    {
      id: "f-019", sku: "NW-8890", productName: "Glass storage jar, 1L",
      field: "capacity", kind: "mismatch",
      customerValue: "1 L", standardValue: "1L", state: "pending",
    },
    {
      id: "f-020", sku: "NW-8890", productName: "Glass storage jar, 1L",
      field: "lidMaterial", kind: "missing",
      customerValue: null, standardValue: "Bamboo", state: "pending",
    },
  ],
  matches: [
    { sku: "NW-1042", field: "name", value: "Cold-pressed rapeseed oil, 5L" },
    { sku: "NW-1042", field: "hsCode", value: "1514.11" },
    { sku: "NW-1187", field: "unit", value: "each" },
    { sku: "NW-1187", field: "weightGrams", value: "250" },
    { sku: "NW-1187", field: "hsCode", value: "2501.00" },
    { sku: "NW-2301", field: "name", value: "Ceramic pour-over cone" },
    { sku: "NW-2301", field: "unit", value: "each" },
    { sku: "NW-3355", field: "name", value: "Linen tea towel, pack of 3" },
    { sku: "NW-3355", field: "material", value: "Linen" },
    { sku: "NW-4102", field: "name", value: "Beeswax food wrap, medium" },
    { sku: "NW-5520", field: "name", value: "Enamel mug, 350ml" },
    { sku: "NW-5520", field: "material", value: "Enamel-coated steel" },
    { sku: "NW-6008", field: "unit", value: "each" },
    { sku: "NW-6008", field: "material", value: "Organic cotton" },
    { sku: "NW-7741", field: "name", value: "Bamboo dish brush" },
    { sku: "NW-7741", field: "unit", value: "each" },
    { sku: "NW-8890", field: "name", value: "Glass storage jar, 1L" },
    { sku: "NW-8890", field: "material", value: "Borosilicate glass" },
  ],
};
