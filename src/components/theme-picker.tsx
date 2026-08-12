import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { THEMES, applyTheme, readTheme, type ThemeId } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemePicker({
  className,
  placement = "bottom",
}: {
  className?: string;
  placement?: "top" | "bottom";
}) {
  const [theme, setTheme] = useState<ThemeId | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = readTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  const pick = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
    setOpen(false);
  };

  return (
    <div className={cn("relative z-20", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change theme"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-foreground/80 backdrop-blur hover:bg-white/15"
      >
        <Palette className="h-4 w-4" />
      </button>

      {open ? (
        <div
          className={cn(
            "absolute left-0 grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-card/80 p-3 backdrop-blur-xl",
            placement === "top" ? "bottom-full mb-2" : "top-12",
          )}
        >
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              aria-label={t.label}
              className={cn(
                "h-7 w-7 rounded-full ring-1 ring-white/20 transition",
                theme === t.id && "ring-2 ring-white/80",
              )}
              style={{ background: t.swatch }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
