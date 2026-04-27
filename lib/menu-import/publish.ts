import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { MenuImportDraft } from "./types";
import { cleanText, flattenDraftItems, parsePrice, slugify } from "./utils";

export async function publishMenuDraft(sessionId: string, vendorId: string, draft: MenuImportDraft) {
  const { data: session, error: sessionLookupError } = await supabaseAdmin
    .from("menu_import_sessions")
    .select("id,status")
    .eq("id", sessionId)
    .eq("vendor_id", vendorId)
    .maybeSingle<{ id: string; status: string | null }>();

  if (sessionLookupError) throw new Error("Could not verify import session: " + sessionLookupError.message);
  if (!session?.id) throw new Error("Import session not found.");
  if ((session.status ?? "").toLowerCase() === "published") {
    throw new Error("This import session has already been published.");
  }

  const { error: sessionUpdateError } = await supabaseAdmin
    .from("menu_import_sessions")
    .update({
      status: "publishing",
      updated_at: new Date().toISOString(),
      review_menu: draft,
      warnings: draft.warnings,
    })
    .eq("id", sessionId)
    .eq("vendor_id", vendorId);

  if (sessionUpdateError) throw new Error("Could not lock import session for publishing: " + sessionUpdateError.message);

  try {
    const categoryIds = new Map<string, string>();
    const rows = flattenDraftItems(draft);

    for (const category of draft.categories) {
      const slug = slugify(category.name) || category.id;
      const { data, error } = await supabaseAdmin
        .from("menu_categories")
        .upsert(
          {
            vendor_id: vendorId,
            name: category.name,
            slug,
            platform_category: rows.find((row) => row.category.id === category.id)?.item.platformCategory ?? "main",
          },
          { onConflict: "vendor_id,slug" }
        )
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error || !data?.id) throw new Error("Could not save menu category: " + (error?.message ?? "Missing category id"));
      categoryIds.set(category.id, data.id);
    }

    for (const { category, item } of rows) {
      const categoryId = categoryIds.get(category.id);
      if (!categoryId) continue;

      const { data: menuItem, error: menuItemError } = await supabaseAdmin
        .from("menu_items")
        .insert({
          session_id: sessionId,
          vendor_id: vendorId,
          category_id: categoryId,
          name: item.name,
          description: cleanText(item.description) || null,
          notes: cleanText(item.notes) || null,
          base_price: item.pricingType === "variant" ? null : parsePrice(item.price),
          pricing_type: item.pricingType,
          food_type: item.foodType,
          unit_label: item.unitLabel,
          image_url: item.imageUrl || null,
          source_confidence: item.sourceConfidence,
        })
        .select("id")
        .maybeSingle<{ id: string }>();

      if (menuItemError || !menuItem?.id) throw new Error("Could not save menu item: " + (menuItemError?.message ?? "Missing item id"));

      const manualFoodPayload = {
        vendor_id: vendorId,
        name: item.name,
        food_type: item.foodType,
        category: item.platformCategory,
        pricing_type: item.pricingType,
        price: item.pricingType === "variant" ? 0 : parsePrice(item.price) ?? 0,
        unit_price: item.pricingType === "per_scoop" || item.pricingType === "per_unit" ? parsePrice(item.price) ?? 0 : null,
        unit_label: item.unitLabel,
        short_description: cleanText(item.description) || null,
        image_url: item.imageUrl || null,
        is_available: true,
        min_qty: item.foodType === "combo" ? 0 : 1,
        max_qty: null,
        stock_qty: item.foodType === "combo" ? 50 : null,
      };

      const { data: foodItem, error: foodItemError } = await supabaseAdmin
        .from("food_items")
        .insert(manualFoodPayload)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (foodItemError || !foodItem?.id) throw new Error("Could not publish food item: " + (foodItemError?.message ?? "Missing food item id"));

      if (item.variants.length > 0) {
        const variants = item.variants
          .map((variant, index) => ({
            menu_item_id: menuItem.id,
            food_item_id: foodItem.id,
            name: variant.name,
            size_label: variant.size,
            price: parsePrice(variant.price) ?? 0,
            notes: variant.notes,
            sort_order: index,
            is_available: true,
          }))
          .filter((variant) => variant.price > 0);

        if (variants.length > 0) {
          const { error: menuVariantError } = await supabaseAdmin.from("menu_variants").insert(
            variants.map((variant) => ({
              menu_item_id: variant.menu_item_id,
              name: variant.name,
              size_label: variant.size_label,
              price: variant.price,
              notes: variant.notes,
              sort_order: variant.sort_order,
            }))
          );
          if (menuVariantError) throw new Error("Could not save menu variants: " + menuVariantError.message);

          const { error: foodVariantError } = await supabaseAdmin.from("food_item_variants").insert(
            variants.map((variant) => ({
              food_item_id: variant.food_item_id,
              name: variant.name,
              price: variant.price,
              is_available: true,
              sort_order: variant.sort_order,
            }))
          );
          if (foodVariantError) throw new Error("Could not publish food variants: " + foodVariantError.message);
        }
      }

      if (item.foodType === "combo") {
        const { error: comboError } = await supabaseAdmin.from("menu_combos").insert({
          menu_item_id: menuItem.id,
          component_names: item.comboParts,
        });
        if (comboError) throw new Error("Could not save combo definition: " + comboError.message);
      }
    }

    const { error: sessionError } = await supabaseAdmin
      .from("menu_import_sessions")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        review_menu: draft,
      })
      .eq("id", sessionId)
      .eq("vendor_id", vendorId);

    if (sessionError) throw new Error("Menu published, but session update failed: " + sessionError.message);
  } catch (error) {
    await supabaseAdmin
      .from("menu_import_sessions")
      .update({
        status: "review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("vendor_id", vendorId);
    throw error;
  }
}
