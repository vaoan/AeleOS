"use client";

import { useSyncExternalStore } from "react";
import { StarToggle } from "@/shared/presentation/star-toggle";
import { NEBULA_CHANGE_EVENT } from "@/shared/presentation/nebula-canvas";
import {
  NEBULA_STORAGE_KEY,
  resolveNebula,
} from "@/shared/application/nebula-preference";

/** What the toggle needs from its caller. */
export interface NebulaToggleProps {
  /** Accessible name for the star, from the message catalogue. */
  label: string;
}

/**
 * Subscribes to changes in the stored preference.
 *
 * @param onChange - called when the preference changes.
 * @returns the unsubscribe function.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(NEBULA_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(NEBULA_CHANGE_EVENT, onChange);
  };
}

/**
 * The stored preference, or an empty string when there is none.
 *
 * @returns the raw stored value.
 */
function getSnapshot(): string {
  try {
    return localStorage.getItem(NEBULA_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * The preference assumed while rendering on the server.
 *
 * @returns the empty string, meaning unset, which resolves to on.
 */
function getServerSnapshot(): string {
  return "";
}

/**
 * The star in the header, wired to the stored nebula preference.
 *
 * Separate from {@link StarToggle} so the button stays a pure, testable
 * component with no storage in it, and separate from the canvas so the header
 * does not have to render one.
 *
 * Writing to storage dispatches a custom event because the `storage` event
 * deliberately does not fire in the tab that made the change — without it the
 * canvas would keep drawing until the next reload.
 *
 * Reports the toggle as pressed based on the preference alone, not on whether
 * the nebula is currently moving: under reduced motion the layer is still on,
 * and showing the star as off would be a lie about what the control did.
 */
export function NebulaToggle({ label }: NebulaToggleProps) {
  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const { enabled } = resolveNebula(stored === "" ? null : stored, false);

  return (
    <StarToggle
      pressed={enabled}
      label={label}
      onToggle={() => {
        try {
          localStorage.setItem(NEBULA_STORAGE_KEY, enabled ? "off" : "on");
        } catch {
          // Storage is unavailable in some privacy modes. The event still
          // fires, so the change applies for this page view and simply does
          // not persist — better than the control doing nothing at all.
        }
        window.dispatchEvent(new Event(NEBULA_CHANGE_EVENT));
      }}
    />
  );
}
