"use client";

import QRCode from "qrcode";
import { useMemo } from "react";

export function Qr({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const { path, count } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: value.length > 300 ? "L" : "M" });
    const modules = qr.modules;
    let d = "";
    for (let y = 0; y < modules.size; y++) {
      let run = 0;
      for (let x = 0; x <= modules.size; x++) {
        const dark = x < modules.size && modules.get(y, x);
        if (dark) run++;
        else if (run) {
          d += `M${x - run} ${y}h${run}v1h-${run}z`;
          run = 0;
        }
      }
    }
    return { path: d, count: modules.size };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      style={{ maxWidth: "100%", height: "auto" }}
      viewBox={`-2 -2 ${count + 4} ${count + 4}`}
      shapeRendering="crispEdges"
      className="rounded-[14px] bg-white"
    >
      <path d={path} fill="#2f1b63" />
    </svg>
  );
}
