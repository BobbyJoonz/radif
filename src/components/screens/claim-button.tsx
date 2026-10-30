"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Take this work". One request, one winner.
 *
 * The 409 is not an error to hide: it means somebody else claimed the same case
 * while this screen was open, so the honest response is a sentence and a refresh —
 * never a silent retry that steals the task back.
 */
export function ClaimButton({
  taskId,
  label,
  conflictLabel,
  errorLabel,
}: {
  taskId: string;
  label: string;
  conflictLabel: string;
  errorLabel: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "conflict" | "error">("idle");

  async function claim() {
    setState("busy");
    try {
      const response = await fetch(`/api/tasks/${taskId}/claim`, { method: "POST" });
      if (response.status === 409) {
        setState("conflict");
        return;
      }
      if (!response.ok) {
        setState("error");
        return;
      }
      router.refresh();
    } catch {
      setState("error");
    }
  }

  if (state === "conflict" || state === "error") {
    return (
      <span className="wdcase-note" role="status">
        {state === "conflict" ? conflictLabel : errorLabel}
      </span>
    );
  }

  return (
    <button type="button" className="ghost-btn wdcase-claim" onClick={claim} disabled={state === "busy"} aria-busy={state === "busy"}>
      {label}
    </button>
  );
}
