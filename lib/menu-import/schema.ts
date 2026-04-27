export const MENU_IMPORT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sourceSummary", "items", "warnings"],
  properties: {
    sourceSummary: { type: "string" },
    warnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message", "severity"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "description",
          "notes",
          "categoryName",
          "platformCategory",
          "foodType",
          "pricingType",
          "price",
          "unitLabel",
          "variants",
          "comboParts",
          "addOns",
          "sourceConfidence",
        ],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          notes: { type: "string" },
          categoryName: { type: "string" },
          platformCategory: {
            anyOf: [
              { type: "string", enum: ["main", "side", "protein", "swallow", "soup", "drink", "extra"] },
              { type: "null" },
            ],
          },
          foodType: { type: "string", enum: ["single", "combo"] },
          pricingType: { type: "string", enum: ["fixed", "per_scoop", "per_unit", "variant"] },
          price: {
            anyOf: [{ type: "number" }, { type: "integer" }, { type: "null" }],
          },
          unitLabel: {
            anyOf: [{ type: "string" }, { type: "null" }],
          },
          comboParts: {
            type: "array",
            items: { type: "string" },
          },
          addOns: {
            type: "array",
            items: { type: "string" },
          },
          variants: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "size", "price", "notes"],
              properties: {
                name: { type: "string" },
                size: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
                price: {
                  anyOf: [{ type: "number" }, { type: "integer" }],
                },
                notes: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
              },
            },
          },
          sourceConfidence: { type: "number" },
        },
      },
    },
  },
} as const;
