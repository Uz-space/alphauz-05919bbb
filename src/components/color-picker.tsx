import { useCallback, useEffect, useRef, useState } from "react";

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

type RailProps = {
  label: string;
  value: number;
  max: number;
  background: string;
  onChange: (v: number) => void;
};

function Rail({ label, value, max, background, onChange }: RailProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const update = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onChange(ratio * max);
    },
    [max, onChange],
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

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuenow={Math.round(value)}
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
        const step = max === 360 ? 2 : 1;
        onChange(Math.min(max, Math.max(0, value + (e.key === "ArrowRight" ? step : -step))));
      }}
    >
      <span
        className="pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-primary bg-transparent shadow-md transition-transform"
        style={{ left: `${(value / max) * 100}%` }}
      />
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [hsl, setHsl] = useState(() => hexToHsl(value));

  const emit = (next: { h: number; s: number; l: number }) => {
    setHsl(next);
    onChange(hslToHex(next.h, next.s, next.l));
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-4">
      <Rail
        label="Hue"
        value={hsl.h}
        max={360}
        background="linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)"
        onChange={(h) => emit({ ...hsl, h })}
      />
      <Rail
        label="Saturation"
        value={hsl.s}
        max={100}
        background={`linear-gradient(90deg,${hslToHex(hsl.h, 0, hsl.l)},${hslToHex(hsl.h, 100, hsl.l)})`}
        onChange={(s) => emit({ ...hsl, s })}
      />
      <Rail
        label="Brightness"
        value={hsl.l}
        max={100}
        background={`linear-gradient(90deg,#000000,${hslToHex(hsl.h, hsl.s, 50)},#ffffff)`}
        onChange={(l) => emit({ ...hsl, l })}
      />
    </div>
  );
}
