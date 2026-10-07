"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/kit/form-dialog";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code", "itf"];

/** Whether this browser can read barcodes with the camera (Chrome on Android, recent desktops). */
export function cameraScanSupported() {
  return typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Reads a barcode with the phone's (or computer's) camera and returns it with `onCode(code)`. A USB
 * scanner needs nothing: it types the code and Enter in the search box.
 */
export function BarcodeScanner({ onCode, label = "Scan" }) {
  const [open, setOpen] = useState(false);
  const [supported] = useState(cameraScanSupported);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} aria-label="Scan a barcode with the camera" title="Scan with the camera"><Camera className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span></Button>
      {open ? <ScannerDialog supported={supported} onClose={() => setOpen(false)} onCode={(c) => { setOpen(false); onCode(c); }} /> : null}
    </>
  );
}

function ScannerDialog({ supported, onClose, onCode }) {
  const video = useRef(null);
  const done = useRef(onCode);
  useEffect(() => {
    done.current = onCode;
  }, [onCode]);
  const [error, setError] = useState(supported ? null : "This browser cannot read barcodes with the camera. Use a USB barcode scanner, or type the code in the search box.");
  useEffect(() => {
    if (!supported) return undefined;
    let stream = null;
    let timer = null;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return;
        video.current.srcObject = stream;
        await video.current.play();
        const supportedFormats = (await window.BarcodeDetector.getSupportedFormats?.()) || FORMATS;
        const detector = new window.BarcodeDetector({ formats: FORMATS.filter((f) => supportedFormats.includes(f)) });
        const tick = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) {
              stopped = true;
              done.current(found[0].rawValue.trim());
              return;
            }
          } catch {
            // the frame was not ready: try the next one
          }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        setError(e?.name === "NotAllowedError" ? "The camera was not allowed. Allow it in the browser, or use a USB scanner." : "The camera could not start on this device.");
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [supported]);
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title="Scan a barcode" description="Hold the barcode in front of the camera, a hand's width away.">
      {error ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : <video ref={video} className="aspect-video w-full rounded-lg bg-black object-cover" muted playsInline />}
    </FormDialog>
  );
}
