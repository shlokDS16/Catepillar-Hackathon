"use client";

import { useCallback, useState } from "react";
import { SosButton } from "@/components/chrome/sos-button";
import { SosSheet } from "@/components/chrome/sos-sheet";
import { useSos } from "@/sos/use-sos";

/** SOS end to end: the hold-to-arm plate, the lifecycle hook and the sheet (interaction-map A10, A11). */
export function SosControl() {
  const { state, active, raise, cancel, emergencyTel } = useSos();
  const [open, setOpen] = useState(false);

  const onArmed = useCallback(
    (requestId: string) => {
      raise(requestId);
      setOpen(true);
    },
    [raise],
  );

  return (
    <>
      <SosButton active={active} onArmed={onArmed} onOpen={() => setOpen(true)} />
      <SosSheet open={open} onClose={() => setOpen(false)} state={state} onCancel={() => void cancel()} emergencyTel={emergencyTel} />
    </>
  );
}
