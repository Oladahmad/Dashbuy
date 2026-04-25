"use client";

type ToastBannerProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
};

export default function ToastBanner({ message, actionLabel, onAction, onClose }: ToastBannerProps) {
  return (
    <div className="fixed left-1/2 top-4 z-[70] w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl border border-emerald-200 bg-white p-3 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{message}</p>
          {actionLabel && onAction ? (
            <button
              type="button"
              className="mt-2 text-sm font-medium text-emerald-700 underline"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-lg border px-2 py-1 text-xs text-gray-600"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
