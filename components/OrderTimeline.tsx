"use client";

import { trackingStepIndex, trackingSummary } from "@/lib/orderTracking";

const STEPS = ["Paid", "Accepted", "Picked up", "Delivered"] as const;

type OrderTimelineProps = {
  status: string | null | undefined;
  title?: string;
  subtitle?: string;
};

const STEP_ICONS = ["💳", "✅", "🚚", "📦"] as const;

export default function OrderTimeline({ status, title = "Real-time tracking", subtitle }: OrderTimelineProps) {
  const stepIndex = trackingStepIndex(status);
  const summary = trackingSummary(status);
  const isFailed = stepIndex === -2;
  const isWaitingPayment = stepIndex === -1;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-black">{title}</p>
          {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {STEPS.map((step, i) => {
          const done = stepIndex >= i;
          const current = stepIndex === i;
          const idle = !done && !current;
          const lineDone = stepIndex > i;

          return (
            <div key={step} className="relative">
              {i < STEPS.length - 1 ? (
                <div className="absolute left-[calc(50%+12px)] right-[-10px] top-4 h-[2px] overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className={[
                      "h-full rounded-full transition-all duration-500",
                      lineDone ? "w-full bg-black" : current ? "w-1/2 animate-pulse bg-amber-500" : "w-0 bg-neutral-200",
                    ].join(" ")}
                  />
                </div>
              ) : null}

              <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-2 text-center">
                <div
                  className={[
                    "mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-sm",
                    done ? "border-black bg-black text-white" : current ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-300 bg-white text-gray-400",
                  ].join(" ")}
                  aria-hidden
                >
                  {STEP_ICONS[i]}
                </div>
                <p
                  className={[
                    "mt-1.5 text-[10px] leading-tight",
                    done || current ? "font-semibold text-black" : idle ? "text-gray-500" : "text-black",
                  ].join(" ")}
                >
                  {step}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {isWaitingPayment ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Payment has not been confirmed yet. The live flow starts immediately after successful payment.
        </div>
      ) : null}

      <p className={["mt-3 text-xs", isFailed ? "text-red-600" : "text-gray-700"].join(" ")}>
        {isFailed ? "Update issue:" : "Status:"} {summary}
      </p>
    </div>
  );
}
