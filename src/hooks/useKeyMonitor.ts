import { useEffect, useState } from "react";

/**
 * Track the state of a named key, e.g. `Shift`.
 */
export function useKeyMonitor(key: string): boolean {
  const [keyPressed, setKeyPressed] = useState<boolean>(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === key) {
        setKeyPressed(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === key) {
        setKeyPressed(false);
      }
    }

    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("keyup", handleKeyUp);

    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
      globalThis.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return keyPressed;
}
