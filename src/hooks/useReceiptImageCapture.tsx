// src/hooks/useReceiptImageCapture.tsx
// Renders a ReceiptSnapshot off-screen and captures it as a PNG file via
// react-native-view-shot. Any screen that needs to download/share a receipt
// as an image renders `hiddenReceipt` somewhere in its tree and calls
// `captureReceipt(opts)` to get a local PNG uri back.

import React, { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import ViewShot from "react-native-view-shot";
import { ReceiptSnapshot } from "../components/pos/ReceiptSnapshot";
import type { ReceiptOptions } from "../utils/printReceipt";

export function useReceiptImageCapture() {
  const [opts, setOpts] = useState<ReceiptOptions | null>(null);
  const shotRef = useRef<ViewShot>(null);
  const pending = useRef<{ resolve: (uri: string) => void; reject: (err: unknown) => void } | null>(null);

  // onLayout fires once the off-screen view has actually rendered; wait two
  // frames on top of that so the native view is fully committed before
  // capture — capturing too early produces a blank/partial image.
  const handleLayout = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        const job = pending.current;
        try {
          if (!job) return;
          if (!shotRef.current?.capture) throw new Error("Receipt capture not ready");
          const uri = await shotRef.current.capture();
          job.resolve(uri);
        } catch (err) {
          job?.reject(err);
        } finally {
          pending.current = null;
          setOpts(null);
        }
      });
    });
  }, []);

  const captureReceipt = useCallback((next: ReceiptOptions): Promise<string> => {
    return new Promise((resolve, reject) => {
      pending.current = { resolve, reject };
      setOpts(next);
    });
  }, []);

  const hiddenReceipt = opts ? (
    <View style={{ position: "absolute", top: 0, left: -4000 }} collapsable={false} onLayout={handleLayout}>
      <ReceiptSnapshot ref={shotRef} {...opts} />
    </View>
  ) : null;

  return { captureReceipt, hiddenReceipt };
}
