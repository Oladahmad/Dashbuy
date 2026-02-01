"use client";

import { useEffect, useRef, useState } from "react";

export default function HomeCarousel({
  images,
  intervalMs = 4000,
}: {
  images: string[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const deltaX = useRef<number>(0);

  // Auto slide
  useEffect(() => {
    if (!images.length) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [images.length, intervalMs]);

  // Swipe handlers (touch)
  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    deltaX.current = 0;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null) return;
    deltaX.current = e.touches[0].clientX - startX.current;
  }

  function onTouchEnd() {
    if (startX.current === null) return;

    const dx = deltaX.current;
    const threshold = 50; // swipe sensitivity

    if (dx > threshold) {
      // swipe right => previous
      setIndex((i) => (i - 1 + images.length) % images.length);
    } else if (dx < -threshold) {
      // swipe left => next
      setIndex((i) => (i + 1) % images.length);
    }

    startX.current = null;
    deltaX.current = 0;
  }

  if (!images.length) return null;

  return (
    <div
      className="mt-4 rounded-2xl overflow-hidden border bg-gray-100"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex transition-transform duration-500"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {images.map((src, i) => (
          <div key={src + i} className="w-full shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Slide ${i + 1}`}
              className="h-36 w-full object-cover"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-1.5 bg-white py-2">
        {images.map((_, i) => (
          <button
            key={i}
            className={`h-2 w-2 rounded-full ${
              i === index ? "bg-orange-600" : "bg-gray-300"
            }`}
            onClick={() => setIndex(i)}
            aria-label={`Go to slide ${i + 1}`}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
