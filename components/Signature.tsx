"use client";
import { useRef } from "react";
export default function Signature({
  onChange,
}: {
  onChange: (image: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false);
  return (
    <div>
      <canvas
        className="signature-pad"
        ref={canvas}
        width={600}
        height={180}
        aria-label="Draw your signature"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const rect = e.currentTarget.getBoundingClientRect(),
            ctx = e.currentTarget.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(
            ((e.clientX - rect.left) * 600) / rect.width,
            ((e.clientY - rect.top) * 180) / rect.height,
          );
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const rect = e.currentTarget.getBoundingClientRect(),
            ctx = e.currentTarget.getContext("2d")!;
          ctx.lineWidth = 2.6;
          ctx.lineCap = "round";
          ctx.strokeStyle = "#222";
          ctx.lineTo(
            ((e.clientX - rect.left) * 600) / rect.width,
            ((e.clientY - rect.top) * 180) / rect.height,
          );
          ctx.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          onChange(canvas.current!.toDataURL("image/png"));
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <button
        type="button"
        className="text-button"
        onClick={() => {
          canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 180);
          onChange("");
        }}
      >
        Clear signature
      </button>
    </div>
  );
}
