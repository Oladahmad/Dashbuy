"use client";

import { trackingStepIndex, trackingSummary } from "@/lib/orderTracking";

const STEPS = ["Paid", "Accepted", "Picked up", "Delivered"] as const;

export default function OrderTimeline({ status }: { status: string | null | undefined }) {
  const stepIndex = trackingStepIndex(status);
  const summary = trackingSummary(status);
  const isFailed = stepIndex === -2;

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Real-time tracking</p>
        <span className="text-xs text-gray-600">Live</span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {STEPS.map((step, i) => {
          const done = stepIndex >= i;
          const current = stepIndex === i;

          return (
            <div key={step} className="rounded-xl border p-2 text-center">
              <div
                className={[
                  "mx-auto h-6 w-6 rounded-full border",
                  done ? "border-black bg-black" : "border-gray-300 bg-white",
                ].join(" ")}
                aria-hidden
              />
              <p className={["mt-2 text-[11px]", current || done ? "text-black font-semibold" : "text-gray-500"].join(" ")}>
                {step}
              </p>
            </div>
          );
        })}
      </div>

      <p className={["mt-3 text-xs", isFailed ? "text-red-600" : "text-gray-600"].join(" ")}>{summary}</p>
    </div>
  );
}
