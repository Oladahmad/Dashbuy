"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { fallbackFoodOrderName } from "@/lib/orderName";
import { withErrandQuoteMeta } from "@/lib/errandQuote";
import { FOOD_CUSTOMER_LOCATION_OPTIONS, getFoodLocationOptionsForOrigin } from "@/lib/foodDeliveryMatrix";
import { calculateCustomerOrderTotal, calculateServiceFee } from "@/lib/pricing";

type PlateLine = {
  foodItemId?: string;
  name: string;
  category?: string;
  pricingType?: "fixed" | "per_scoop" | "per_unit" | "variant" | "custom";
  qty: number;
  unitPrice: number;
  unitLabel?: string | null;
  variantId?: string | null;
  variantName?: string | null;
};

type CartPlate = {
  vendorId: string;
  vendorName: string;
  plateTemplateId: string;
  plateName: string;
  plateFee: number;
  plateTotal: number;
  lines: PlateLine[];
  createdAt: string;
  customRequest?: {
    restaurantName: string;
    itemsSubtotal: number;
  };
};

type ComboCartItem = {
  comboId: string;
  name: string;
  price: number;
  qty: number;
  vendorId: string;
  vendorName: string;
};

type FoodCart = {
  vendorId: string | null;
  plates: CartPlate[];
  combos: ComboCartItem[];
};

type GeoPoint = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

function isLocalHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function geoErrorMessage(err: unknown) {
  const code = (err as GeolocationPositionError | undefined)?.code;
  if (code === 1) return "Location permission is blocked on this phone/browser. Enable location permission and try again.";
  if (code === 2) return "Location is unavailable right now. Turn on GPS and mobile data, then try again.";
  if (code === 3) return "Location request timed out. Move to open sky and try again.";
  return "Unable to get your location. Check permission, GPS, and internet, then try again.";
}

function getPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

const FOOD_CART_KEY = "dashbuy_food_cart_v1";
const DEFAULT_CUSTOM_REQUEST_DELIVERY_FEE = 900;
const CUSTOM_REQUEST_VENDOR_ID = "custom_request";

type DeliveryQuote = {
  total: number;
  customerLocation: string;
  byVendor: Record<string, { vendorName: string; origin: string | null; fee: number | null; error?: string }>;
};

function formatNaira(n: number) {
  return `N${Math.round(n).toLocaleString()}`;
}

function formatGeoPoint(g: GeoPoint) {
  const base = `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}`;
  if (g.accuracy && Number.isFinite(g.accuracy)) return `${base} (+/-${Math.round(g.accuracy)}m)`;
  return base;
}

function readCart(): FoodCart {
  if (typeof window === "undefined") return { vendorId: null, plates: [], combos: [] };
  try {
    const raw = localStorage.getItem(FOOD_CART_KEY);
    if (!raw) return { vendorId: null, plates: [], combos: [] };
    const parsed = JSON.parse(raw) as {
      vendorId?: string | null;
      plates?: CartPlate[];
      combos?: ComboCartItem[];
    };
    return {
      vendorId: parsed.vendorId ?? null,
      plates: Array.isArray(parsed.plates) ? parsed.plates : [],
      combos: Array.isArray(parsed.combos) ? parsed.combos : [],
    };
  } catch {
    return { vendorId: null, plates: [], combos: [] };
  }
}

export default function FoodCheckoutPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [plates, setPlates] = useState<CartPlate[]>([]);
  const [combos, setCombos] = useState<ComboCartItem[]>([]);
  const [vendorName, setVendorName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [geoPoint, setGeoPoint] = useState<GeoPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [customerLocation, setCustomerLocation] = useState("");
  const [payMethod, setPayMethod] = useState<"wallet" | "card">("card");
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletPinEnabled, setWalletPinEnabled] = useState(false);
  const [walletPin, setWalletPin] = useState("");
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [vendorOrigins, setVendorOrigins] = useState<Record<string, string | null>>({});

  const platesSubtotal = useMemo(() => plates.reduce((sum, p) => sum + Number(p.plateTotal), 0), [plates]);
  const combosSubtotal = useMemo(() => combos.reduce((sum, c) => sum + Number(c.price) * Number(c.qty), 0), [combos]);
  const subtotal = platesSubtotal + combosSubtotal;
  const vendorCount = useMemo(() => {
    const ids = new Set<string>();
    for (const p of plates) {
      if (p.vendorId) ids.add(p.vendorId);
    }
    for (const c of combos) {
      if (c.vendorId) ids.add(c.vendorId);
    }
    return ids.size;
  }, [plates, combos]);
  const cartVendorIds = useMemo(
    () =>
      Array.from(
        new Set(
          [...plates.map((p) => p.vendorId), ...combos.map((c) => c.vendorId)].filter(
            (value): value is string => typeof value === "string" && value.length > 0
          )
        )
      ),
    [plates, combos]
  );
  const customVendorCount = useMemo(
    () => cartVendorIds.filter((vendorId) => vendorId === CUSTOM_REQUEST_VENDOR_ID).length,
    [cartVendorIds]
  );
  const quotedVendorDeliveryTotal = deliveryQuote?.total ?? 0;
  const totalDeliveryFee = quotedVendorDeliveryTotal + customVendorCount * DEFAULT_CUSTOM_REQUEST_DELIVERY_FEE;
  const serviceFeeTotal = useMemo(() => {
    const groupedSubtotals = new Map<string, number>();
    for (const p of plates) {
      groupedSubtotals.set(p.vendorId, (groupedSubtotals.get(p.vendorId) ?? 0) + Number(p.plateTotal));
    }
    for (const c of combos) {
      groupedSubtotals.set(c.vendorId, (groupedSubtotals.get(c.vendorId) ?? 0) + Number(c.price) * Number(c.qty));
    }
    return Array.from(groupedSubtotals.values()).reduce((sum, vendorSubtotal) => sum + calculateServiceFee(vendorSubtotal), 0);
  }, [plates, combos]);
  const total = subtotal + totalDeliveryFee + serviceFeeTotal;
  const nonCustomVendorIds = useMemo(
    () => cartVendorIds.filter((vendorId) => vendorId !== CUSTOM_REQUEST_VENDOR_ID),
    [cartVendorIds]
  );
  const singleVendorOrigin =
    nonCustomVendorIds.length === 1 ? (vendorOrigins[nonCustomVendorIds[0]] ?? null) : null;
  const pricedLocationOptions = useMemo(
    () => (singleVendorOrigin ? getFoodLocationOptionsForOrigin(singleVendorOrigin) : []),
    [singleVendorOrigin]
  );

  useEffect(() => {
    (async () => {
      const cart = readCart();
      setPlates(cart.plates);
      setCombos(cart.combos);
      setVendorName(cart.plates[0]?.vendorName ?? cart.combos[0]?.vendorName ?? "");

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        router.replace("/auth/login?next=%2Ffood%2Fcheckout");
        return;
      }
      const token = sessionData.session?.access_token ?? "";
      if (token) {
        const balRes = await fetch("/api/wallet/balance", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const balBody = (await balRes.json().catch(() => null)) as { ok?: boolean; balance?: number } | null;
        if (balRes.ok && balBody?.ok) {
          setWalletBalance(Number(balBody.balance ?? 0));
        }

        const pinRes = await fetch("/api/wallet/pin", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const pinBody = (await pinRes.json().catch(() => null)) as { ok?: boolean; enabled?: boolean } | null;
        if (pinRes.ok && pinBody?.ok) {
          setWalletPinEnabled(!!pinBody.enabled);
        }
      }
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadDeliveryQuote() {
      const vendorIds = cartVendorIds.filter((vendorId) => vendorId !== CUSTOM_REQUEST_VENDOR_ID);
      if (!customerLocation || vendorIds.length === 0) {
        setDeliveryQuote(null);
        setDeliveryQuoteLoading(false);
        return;
      }

      setDeliveryQuoteLoading(true);
      const resp = await fetch("/api/food/delivery-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorIds, customerLocation }),
      });
      const body = (await resp.json().catch(() => null)) as
        | { ok?: boolean; error?: string; total?: number; customerLocation?: string; byVendor?: DeliveryQuote["byVendor"] }
        | null;

      if (cancelled) return;

      if (!resp.ok || !body?.ok || !body.byVendor || typeof body.total !== "number") {
        setDeliveryQuote(null);
        if (customerLocation) {
          setMsg(body?.error ?? "Could not calculate delivery fee for the selected location.");
        }
        setDeliveryQuoteLoading(false);
        return;
      }

      setDeliveryQuote({
        total: body.total,
        customerLocation: body.customerLocation ?? customerLocation,
        byVendor: body.byVendor,
      });
      setDeliveryQuoteLoading(false);
    }

    loadDeliveryQuote();
    return () => {
      cancelled = true;
    };
  }, [cartVendorIds, customerLocation]);

  useEffect(() => {
    let cancelled = false;

    async function loadVendorOrigins() {
      if (nonCustomVendorIds.length === 0) {
        setVendorOrigins({});
        return;
      }

      const entries = await Promise.all(
        nonCustomVendorIds.map(async (vendorId) => {
          try {
            const resp = await fetch(`/api/catalog/food/vendor/${vendorId}`, { cache: "no-store" });
            const body = (await resp.json().catch(() => null)) as
              | { ok?: boolean; vendor?: { food_delivery_origin?: string | null } }
              | null;
            return [vendorId, body?.ok ? body.vendor?.food_delivery_origin ?? null : null] as const;
          } catch {
            return [vendorId, null] as const;
          }
        })
      );

      if (cancelled) return;
      setVendorOrigins(Object.fromEntries(entries));
    }

    loadVendorOrigins();

    return () => {
      cancelled = true;
    };
  }, [nonCustomVendorIds]);

  async function captureGeoPoint() {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setMsg("Geolocation is not available on this device/browser.");
      return;
    }
    if (!window.isSecureContext && !isLocalHost()) {
      setMsg("Location capture requires HTTPS. On mobile, use your secure deployed URL (not local network HTTP).");
      return;
    }

    setLocating(true);
    setMsg("");

    try {
      if ("permissions" in navigator && navigator.permissions?.query) {
        const p = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        if (p.state === "denied") {
          setMsg("Location permission is denied. Enable it in browser settings and try again.");
          return;
        }
      }

      let pos: GeolocationPosition;
      try {
        pos = await getPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      } catch {
        pos = await getPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 });
      }

      await new Promise((resolve) => setTimeout(resolve, 1800));

      setGeoPoint({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
      });
      const accuracy = Number(pos.coords.accuracy || 0);
      if (accuracy > 200) {
        setMsg(`Location captured but accuracy is low (+/-${Math.round(accuracy)}m). For better result, move outdoors and recapture.`);
      }
    } catch (err) {
      setMsg(geoErrorMessage(err));
    } finally {
      setLocating(false);
    }
  }

  async function placeOrder() {
    setMsg("");
    if (plates.length === 0 && combos.length === 0) return setMsg("Your cart is empty.");

    const addr = deliveryAddress.trim();
    if (!addr) return setMsg("Enter your delivery address before continuing.");
    if (addr.length < 10) {
      return setMsg("Please include house number, street, area and landmark for fast delivery.");
    }
    if (!customerLocation) return setMsg("Choose your delivery location before continuing.");

    const phoneClean = phone.trim();
    if (!phoneClean) return setMsg("Enter your phone number.");

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      router.push("/auth/login?next=%2Ffood%2Fcheckout");
      return;
    }

    const geoText = geoPoint ? `GPS: ${formatGeoPoint(geoPoint)}` : "";
    const hasAddr = addr.length > 0;
    const hasGeo = !!geoPoint;
    const deliveryAddressPayload = hasAddr && hasGeo ? `${addr} | ${geoText}` : hasAddr ? addr : geoText;
    const sourceText = hasAddr && hasGeo ? "manual address + geopoint" : hasGeo ? "geopoint" : "manual address";

    const notesPayload = [notes.trim(), `Location source: ${sourceText}`]
      .filter((x) => x.length > 0)
      .join(" | ");

    setLoading(true);

    const grouped = new Map<string, { plates: CartPlate[]; combos: ComboCartItem[] }>();
    for (const p of plates) {
      if (!p.vendorId) continue;
      const entry = grouped.get(p.vendorId) ?? { plates: [], combos: [] };
      entry.plates.push(p);
      grouped.set(p.vendorId, entry);
    }
    for (const c of combos) {
      if (!c.vendorId) continue;
      const entry = grouped.get(c.vendorId) ?? { plates: [], combos: [] };
      entry.combos.push(c);
      grouped.set(c.vendorId, entry);
    }

    if (grouped.size === 0) {
      setLoading(false);
      setMsg("Missing vendor. Add food items again.");
      return;
    }

    const createdOrderIds: string[] = [];

    for (const [vendorId, group] of grouped.entries()) {
      const isCustomVendor = vendorId === CUSTOM_REQUEST_VENDOR_ID;
      const orderVendorId = isCustomVendor ? userId : vendorId;
      if (!isCustomVendor) {
        try {
          const vendorRes = await fetch(`/api/catalog/food/vendor/${vendorId}`, { cache: "no-store" });
          const vendorBody = (await vendorRes.json().catch(() => null)) as
            | { ok?: boolean; vendor?: { store_name?: string | null; full_name?: string | null; availability?: { isOpen?: boolean; statusLabel?: string } } }
            | null;
          const vendorNameForState =
            String(vendorBody?.vendor?.store_name ?? "").trim() ||
            String(vendorBody?.vendor?.full_name ?? "").trim() ||
            "This restaurant";
          if (!vendorRes.ok || !vendorBody?.ok || vendorBody.vendor?.availability?.isOpen === false) {
            setLoading(false);
            setMsg(`${vendorNameForState} is currently closed. ${vendorBody?.vendor?.availability?.statusLabel ?? "Please try again later."}`);
            return;
          }
        } catch {
          setLoading(false);
          setMsg("Could not confirm restaurant availability. Please try again.");
          return;
        }
      }
      const vendorSubtotal =
        group.plates.reduce((sum, p) => sum + Number(p.plateTotal), 0) +
        group.combos.reduce((sum, c) => sum + Number(c.price) * Number(c.qty), 0);
      const vendorDeliveryFee =
        vendorId === CUSTOM_REQUEST_VENDOR_ID
          ? DEFAULT_CUSTOM_REQUEST_DELIVERY_FEE
          : deliveryQuote?.byVendor?.[vendorId]?.fee ?? null;
      if (vendorId !== CUSTOM_REQUEST_VENDOR_ID && (vendorDeliveryFee == null || vendorDeliveryFee < 0)) {
        setLoading(false);
        setMsg(
          deliveryQuote?.byVendor?.[vendorId]?.error ??
            "Delivery fee is not set for this restaurant and location yet."
        );
        return;
      }
      const vendorPricing = calculateCustomerOrderTotal(vendorSubtotal, Number(vendorDeliveryFee ?? 0));
      const vendorTotal = vendorPricing.total;
      const foodMode: "plate" | "combo" = group.plates.length > 0 ? "plate" : "combo";

      const candidateNames = [
        ...group.plates.flatMap((p) => p.lines.map((line) => line.name ?? "").filter(Boolean)),
        ...group.combos.map((c) => c.name),
      ];
      let generatedOrderName = fallbackFoodOrderName(candidateNames);
      try {
        const titleRes = await fetch("/api/ai/order-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restaurantName: group.plates[0]?.customRequest?.restaurantName ?? group.plates[0]?.vendorName ?? "",
            itemNames: candidateNames,
          }),
        });
        const titleBody = (await titleRes.json().catch(() => null)) as { ok?: boolean; name?: string } | null;
        if (titleBody?.ok && titleBody.name?.trim()) {
          generatedOrderName = titleBody.name.trim();
        }
      } catch {
        // Keep fallback title.
      }

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          order_type: "food",
          food_mode: foodMode,
          customer_id: userId,
          vendor_id: orderVendorId,
          status: "pending_payment",
          subtotal: vendorSubtotal,
          delivery_fee: Number(vendorDeliveryFee ?? 0),
          total: vendorTotal,
          total_amount: vendorTotal,
          delivery_address: deliveryAddressPayload,
          delivery_address_source: "manual",
          customer_phone: phoneClean,
          notes: isCustomVendor
            ? withErrandQuoteMeta(
                [`Order name: ${generatedOrderName}`, `Customer area: ${customerLocation}`, notesPayload].filter(Boolean).join(" | "),
                { isErrand: true, status: "pending" }
              )
            : [`Order name: ${generatedOrderName}`, `Customer area: ${customerLocation}`, notesPayload].filter(Boolean).join(" | "),
        })
        .select("id")
        .single();

      if (orderErr || !order) {
        setLoading(false);
        setMsg("Order error: " + (orderErr?.message ?? "unknown"));
        return;
      }

      createdOrderIds.push(order.id);

      for (const p of group.plates) {
        const isCustomPlate = p.plateTemplateId === "__custom_request__";
        if (isCustomPlate) {
          const customSubtotal =
            p.customRequest?.itemsSubtotal ??
            p.lines.reduce((sum, line) => sum + Number(line.qty) * Number(line.unitPrice), 0);

          const { data: customRequest, error: customErr } = await supabase
            .from("custom_food_requests")
            .insert({
              order_id: order.id,
              customer_id: userId,
              vendor_id: orderVendorId,
              restaurant_name: p.customRequest?.restaurantName ?? p.vendorName,
              plate_name: p.plateName,
              plate_fee: Number(p.plateFee),
              items_subtotal: Number(customSubtotal),
              total_amount: Number(p.plateTotal),
            })
            .select("id")
            .single();

          if (customErr || !customRequest) {
            setLoading(false);
            setMsg(
              `Custom request save error: ${customErr?.message ?? "unknown"}. Run the SQL setup for custom_food_requests tables first.`
            );
            return;
          }

          const customItems = p.lines.map((line) => ({
            request_id: customRequest.id,
            food_name: line.name,
            units: Math.max(1, Math.floor(Number(line.qty) || 1)),
            unit_price: Math.max(0, Number(line.unitPrice) || 0),
            line_total: Math.max(1, Math.floor(Number(line.qty) || 1)) * Math.max(0, Number(line.unitPrice) || 0),
          }));

          if (customItems.length > 0) {
            const { error: customItemsErr } = await supabase
              .from("custom_food_request_items")
              .insert(customItems);
            if (customItemsErr) {
              setLoading(false);
              setMsg(
                `Custom request items error: ${customItemsErr.message}. Run the SQL setup for custom_food_request_items table first.`
              );
              return;
            }
          }

          continue;
        }

        const { data: op, error: opErr } = await supabase
          .from("order_plates")
          .insert({
            order_id: order.id,
            plate_template_id: p.plateTemplateId,
            plate_fee: p.plateFee,
            plate_total: p.plateTotal,
          })
          .select("id")
          .single();

        if (opErr || !op) {
          setLoading(false);
          setMsg("Order plate error: " + (opErr?.message ?? "unknown"));
          return;
        }

        const rows = p.lines
          .filter((l) => typeof l.foodItemId === "string" && l.foodItemId.length > 0)
          .map((l) => ({
            order_plate_id: op.id,
            food_item_id: l.foodItemId as string,
            variant_id: l.variantId ?? null,
            qty: l.qty,
            unit_price: l.unitPrice,
            line_total: l.qty * l.unitPrice,
          }));
        if (rows.length === 0) {
          setLoading(false);
          setMsg("Plate items error: no valid food items found for this plate.");
          return;
        }

        const { error: itemsErr } = await supabase.from("order_plate_items").insert(rows);
        if (itemsErr) {
          setLoading(false);
          setMsg("Plate items error: " + itemsErr.message);
          return;
        }
      }

      if (group.combos.length > 0) {
        const comboRows = group.combos.map((it) => ({
          order_id: order.id,
          combo_food_id: it.comboId,
          qty: it.qty,
          unit_price: it.price,
          line_total: it.price * it.qty,
        }));
        const { error: comboErr } = await supabase.from("combo_order_items").insert(comboRows);
        if (comboErr) {
          setLoading(false);
          setMsg("Combo items error: " + comboErr.message);
          return;
        }
      }
    }

    const { data: refreshedSessionData } = await supabase.auth.getSession();
    const session = refreshedSessionData.session;
    const token = session?.access_token;
    const email = session?.user?.email?.trim() ?? "";
    if (!token) {
      setLoading(false);
      router.push("/auth/login?next=%2Ffood%2Fcheckout");
      return;
    }

    if (payMethod === "wallet") {
      const payRes = await fetch("/api/wallet/pay-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderIds: createdOrderIds, pin: walletPin }),
      });
      const payBody = (await payRes.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!payRes.ok || !payBody?.ok) {
        setLoading(false);
        setMsg(payBody?.error ?? "Wallet payment failed. You can try card payment.");
        return;
      }
      localStorage.removeItem(FOOD_CART_KEY);
      setLoading(false);
      const successQuery =
        createdOrderIds.length === 1
          ? `orderId=${encodeURIComponent(createdOrderIds[0])}`
          : `orderIds=${encodeURIComponent(createdOrderIds.join(","))}`;
      router.push(`/food/order-success?${successQuery}`);
      return;
    }

    if (!email) {
      setLoading(false);
      setMsg("Missing customer email on your account. Please log in again.");
      return;
    }

    const paymentRes = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        orderId: createdOrderIds.length === 1 ? createdOrderIds[0] : undefined,
        orderIds: createdOrderIds,
        email,
      }),
    });
    const paymentBody = (await paymentRes.json().catch(() => null)) as
      | { ok?: boolean; error?: string; authorization_url?: string }
      | null;

    if (!paymentRes.ok || !paymentBody?.ok || !paymentBody.authorization_url) {
      setLoading(false);
      setMsg(paymentBody?.error ?? "Unable to continue payment.");
      return;
    }

    localStorage.removeItem(FOOD_CART_KEY);
    setLoading(false);
    window.location.href = paymentBody.authorization_url;
  }

  if (loading) return <main className="p-6">Loading...</main>;
  const isEmpty = plates.length === 0 && combos.length === 0;

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <button
        type="button"
        className="mb-4 rounded-xl border px-3 py-2 text-sm"
        onClick={() => router.push("/food/cart")}
      >
        Back
      </button>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Checkout</h1>
        <p className="mt-2 text-sm text-gray-600">
          Confirm your location, payment method and order details.
        </p>
        {vendorCount === 1 && vendorName ? <p className="mt-2 text-sm text-gray-600">Vendor: {vendorName}</p> : null}
        {vendorCount > 1 ? <p className="mt-2 text-sm text-gray-600">Vendors: {vendorCount}</p> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Delivery details</h2>
        <p className="mt-2 text-sm text-gray-600">
          Enter the full delivery address. If you are already at the delivery point, capture your current location to help logistics find you faster.
        </p>
        <div className="mt-5 grid gap-4">
          <div>
            <label className="text-sm font-medium">Delivery location</label>
            <select
              className="mt-2 w-full rounded-xl border p-3"
              value={customerLocation}
              onChange={(e) => {
                setCustomerLocation(e.target.value);
                setMsg("");
              }}
            >
              <option value="">UNIQUE - Choose your exact location</option>
              {pricedLocationOptions.length > 0
                ? pricedLocationOptions.map((option) => (
                    <option key={option.location} value={option.location}>
                      {option.location}
                      {option.location === "Dashbuy" ? "" : ` - ${formatNaira(option.price)}`}
                    </option>
                  ))
                : FOOD_CUSTOMER_LOCATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">
              Required. Choose your exact location, not a broad area. Delivery price will be calculated from the restaurant base location.
            </p>
            {singleVendorOrigin ? (
              <p className="mt-1 text-xs text-gray-500">Restaurant base location: {singleVendorOrigin}</p>
            ) : null}
          </div>
          <div>
            <label className="text-sm font-medium">Delivery address</label>
            <div className="mt-2 overflow-hidden rounded-2xl border">
              <textarea
                className="w-full border-0 p-4 focus:outline-none"
                rows={4}
                placeholder="House number, street, area, landmark"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
              <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-3">
                <button
                  type="button"
                  className="rounded-lg border bg-white px-3 py-2 text-sm"
                  onClick={captureGeoPoint}
                  disabled={locating}
                >
                  {locating ? "Capturing..." : "Capture location"}
                </button>
                {geoPoint ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Location captured
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">Optional but recommended</span>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Phone number</label>
              <input
                className="mt-2 w-full rounded-xl border p-3"
                placeholder="080..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Note</label>
              <textarea
                className="mt-2 w-full rounded-xl border p-3"
                rows={4}
                placeholder="Optional delivery note"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>
        {customerLocation ? (
          <div className="mt-4 rounded-2xl border bg-gray-50 p-4 text-sm">
            {deliveryQuoteLoading ? (
              <p className="text-gray-600">Calculating delivery fee...</p>
            ) : deliveryQuote ? (
              <div className="space-y-2">
                {Object.values(deliveryQuote.byVendor).map((row, index) => (
                  <div key={row.vendorName + index} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      {row.vendorName}
                      {row.origin ? ` (${row.origin})` : ""}
                    </span>
                    <span className="font-medium">
                      {row.fee != null ? formatNaira(row.fee) : row.error ?? "Not set"}
                    </span>
                  </div>
                ))}
                {customVendorCount > 0 ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>Custom request delivery</span>
                    <span className="font-medium">{formatNaira(customVendorCount * DEFAULT_CUSTOM_REQUEST_DELIVERY_FEE)}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-red-600">Delivery price is not available for this route yet.</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Payment method</h2>
        <p className="mt-2 text-sm text-gray-600">
          Choose whether to pay from your wallet or continue to Paystack.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-xl border px-3 py-3 text-sm ${payMethod === "card" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setPayMethod("card")}
          >
            Payment gateway
          </button>
          <button
            type="button"
            className={`rounded-xl border px-3 py-3 text-sm ${payMethod === "wallet" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setPayMethod("wallet")}
          >
            Wallet
          </button>
        </div>

        {payMethod === "wallet" ? (
          <div className="mt-4 rounded-2xl border p-4">
            <p className="text-xs text-gray-600">Wallet balance</p>
            <p className="mt-1 text-lg font-semibold">{formatNaira(walletBalance)}</p>
            {walletBalance < total ? (
              <p className="mt-3 text-xs text-red-600">Wallet balance is not enough for this order.</p>
            ) : null}
            {!walletPinEnabled ? (
              <p className="mt-3 text-xs text-red-600">Set your wallet PIN first in Account before paying with wallet.</p>
            ) : (
              <div className="mt-4">
                <label className="text-xs text-gray-600">Wallet PIN</label>
                <input
                  className="mt-2 w-full rounded-xl border p-3"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Enter your 4-digit PIN"
                  value={walletPin}
                  onChange={(e) => setWalletPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
            )}
            <button
              type="button"
              className="mt-3 rounded-xl border px-3 py-2 text-sm"
              onClick={() => router.push("/account/add-funds")}
            >
              Add funds
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border bg-gray-50 p-4 text-sm text-gray-600">
            You’ll be redirected to the payment gateway to complete this order.
          </div>
        )}
      </section>
      </div>

      <aside className="lg:sticky lg:top-24">
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Order summary</h2>

        {isEmpty ? (
          <p className="mt-2 text-gray-600">Cart is empty.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {plates.map((p, idx) => (
              <div key={p.createdAt + idx} className="flex justify-between">
                <span>{p.plateName}</span>
                <span className="font-semibold">{formatNaira(Number(p.plateTotal))}</span>
              </div>
            ))}
            {combos.map((c) => (
              <div key={c.comboId} className="flex justify-between">
                <span>
                  {c.name} x {c.qty}
                </span>
                <span className="font-semibold">{formatNaira(Number(c.price) * Number(c.qty))}</span>
              </div>
            ))}
          </div>
        )}

        <hr className="my-3" />
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="font-semibold">{formatNaira(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Delivery fee</span>
          <span className="font-semibold">{customerLocation ? formatNaira(totalDeliveryFee) : "Select location"}</span>
        </div>
        <div className="flex justify-between">
          <span>Service fee</span>
          <span className="font-semibold">{formatNaira(serviceFeeTotal)}</span>
        </div>
        <div className="mt-2 flex justify-between text-lg">
          <span>Total</span>
          <span className="font-semibold">{formatNaira(total)}</span>
        </div>
        {msg ? <p className="mt-4 text-sm text-red-600">{msg}</p> : null}
      <button
        className="mt-6 w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
        onClick={placeOrder}
        disabled={
          isEmpty ||
          loading ||
          !customerLocation ||
          cartVendorIds.some((vendorId) => vendorId !== CUSTOM_REQUEST_VENDOR_ID && deliveryQuote?.byVendor?.[vendorId]?.fee == null) ||
          (payMethod === "wallet" && (walletBalance < total || !walletPinEnabled || walletPin.length !== 4))
        }
      >
        {payMethod === "wallet" ? "Continue with wallet" : "Continue to payment gateway"}
      </button>
      </section>
      </aside>
      </div>
    </main>
  );
}
