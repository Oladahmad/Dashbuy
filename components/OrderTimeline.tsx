"use client";

import { buildTrackingTimeline, normalizeStatus, trackingSummary } from "@/lib/orderTracking";

type OrderTimelineProps = {
  status: string | null | undefined;
  title?: string;
  subtitle?: string;
};

export default function OrderTimeline({ status, title = "Real-time tracking", subtitle }: OrderTimelineProps) {
  const steps = buildTrackingTimeline(status);
  const summary = trackingSummary(status);
  const normalized = normalizeStatus(status);
  const isTerminal = ["rejected", "declined", "cancelled", "refunded"].includes(normalized);
  const isWaitingPayment = normalized === "pending_payment";
  const badgeClass = isTerminal
    ? "border-red-200 bg-red-50 text-red-700"
    : isWaitingPayment
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const badgeLabel = isTerminal ? "Closed" : isWaitingPayment ? "Pending" : "Live";

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-black">{title}</p>
          {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium ${badgeClass}`}>
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={[
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                isTerminal ? "bg-red-500" : isWaitingPayment ? "bg-amber-500" : "bg-emerald-500",
              ].join(" ")}
            />
          </span>
          {badgeLabel}
        </span>
      </div>

      <div className="mt-4 rounded-2xl bg-neutral-50/80 p-4">
        <div className="space-y-0">
          {steps.map((step, index) => {
            const isDone = step.state === "done";
            const isCurrent = step.state === "current";
            const dotClass = isDone
              ? "border-emerald-600 bg-emerald-600"
              : isCurrent
                ? isTerminal
                  ? "border-red-500 bg-red-500"
                  : isWaitingPayment
                    ? "border-amber-500 bg-amber-500"
                    : "border-emerald-500 bg-emerald-500"
                : "border-gray-300 bg-white";
            const lineClass = isDone ? "bg-emerald-500" : "bg-gray-200";
          return (
            <div key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
              <div className="relative flex w-6 justify-center">
                <span className={`mt-1 inline-flex h-4 w-4 rounded-full border-2 ${dotClass}`} />
                {index < steps.length - 1 ? <span className={`absolute top-5 h-[calc(100%-0.25rem)] w-[2px] ${lineClass}`} /> : null}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className={`text-sm ${isDone || isCurrent ? "font-semibold text-black" : "font-medium text-gray-500"}`}>
                  {step.label}
                </p>
                <p className="mt-1 text-sm leading-5 text-gray-600">{step.description}</p>
              </div>
            </div>
          );
          })}
        </div>
      </div>

      {isWaitingPayment ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Payment has not been confirmed yet. The live flow starts immediately after successful payment.
        </div>
      ) : null}

      <p className={["mt-3 text-xs", isTerminal ? "text-red-600" : "text-gray-700"].join(" ")}>
        {isTerminal ? "Update:" : "Status:"} {summary}
      </p>
    </div>
  );
}
