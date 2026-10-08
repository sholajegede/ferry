"use client";

import { useEffect, useRef, useState } from "react";
import { Modal, Notice } from "./ui";

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };

function Viewfinder({ hint, onResult }: { hint: string; onResult(value: string): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const handler = useRef(onResult);

  useEffect(() => {
    handler.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let frame = 0;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This browser cannot use the camera. Type the 6-digit code or paste the link.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch (error) {
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        setProblem(
          denied
            ? "Camera access is blocked. Allow the camera for this site, or type the 6-digit code."
            : "No camera was found. Type the 6-digit code or paste the link.",
        );
        return;
      }
      const element = video.current;
      if (stopped || !element) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      element.srcObject = stream;
      await element.play().catch(() => undefined);

      const Native = (window as unknown as {
        BarcodeDetector?: new (options: { formats: string[] }) => Detector;
      }).BarcodeDetector;
      let detector: Detector | null = null;
      try {
        detector = Native ? new Native({ formats: ["qr_code"] }) : null;
      } catch {
        detector = null;
      }
      const jsqr = detector ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      let last = 0;

      const tick = async (time: number) => {
        if (stopped) return;
        frame = requestAnimationFrame(tick);
        if (time - last < 140 || element.readyState < 2) return;
        last = time;
        try {
          let value: string | undefined;
          if (detector) {
            value = (await detector.detect(element))[0]?.rawValue;
          } else if (jsqr && context) {
            const scale = Math.min(1, 800 / element.videoWidth);
            canvas.width = Math.round(element.videoWidth * scale);
            canvas.height = Math.round(element.videoHeight * scale);
            context.drawImage(element, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            value = jsqr(image.data, image.width, image.height)?.data;
          }
          if (value && !stopped) {
            stopped = true;
            handler.current(value);
          }
        } catch {}
      };
      frame = requestAnimationFrame(tick);
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (problem) return <Notice tone="error">{problem}</Notice>;
  return (
    <>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80" />
      </div>
      <p className="mt-3 text-sm text-ink/80">{hint}</p>
    </>
  );
}

export function Scanner({
  open,
  title,
  hint,
  onResult,
  onClose,
}: {
  open: boolean;
  title: string;
  hint: string;
  onResult(value: string): void;
  onClose(): void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {open && <Viewfinder hint={hint} onResult={onResult} />}
    </Modal>
  );
}
