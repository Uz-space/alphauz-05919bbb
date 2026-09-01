import { useCallback, useEffect, useRef, useState } from "react";

export type FxSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  background: string;
  onChange: (v: number) => void;
};

/** Slider styled exactly like the RGB colour rails. */
export function FxSlider({ label, value, min, max, step, background, onChange }: FxSliderProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const clampStep = useCallback(
    (v: number) => {
      const snapped = Math.round((v - min) / step) * step + min;
      return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
    },
    [min, max, step],
  );

  const update = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onChange(clampStep(min + ratio * (max - min)));
    },
    [min, max, clampStep, onChange],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => update(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, update]);

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      className="relative h-3 w-full cursor-pointer touch-none rounded-full border border-border shadow-inner outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{ background }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        update(e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onChange(clampStep(value + (e.key === "ArrowRight" ? step : -step)));
      }}
    >
      <span
        className="pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-primary bg-transparent shadow-md transition-transform"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
