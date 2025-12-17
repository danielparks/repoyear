import { useEffect, useMemo, useState } from "react";
import { Calendar } from "../model.ts";
import type { Contributions } from "../github/api.ts";

export interface UseStaticCalendarResult {
  calendar: Calendar | null;
  error: string | null;
  loading: boolean;
}

export function useStaticCalendar(): UseStaticCalendarResult {
  const [contributions, setContributions] = useState<Contributions[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url =
      (import.meta.env.VITE_CONTRIBUTIONS_URL as string | undefined) ||
      "assets/contributions.json";
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then((data: Contributions[]) => {
        setContributions(data);
      })
      .catch((error: unknown) => {
        console.error(`Error loading ${url}`, error);
        setError("Could not load contributions.");
      });
  }, []);

  const calendar = useMemo(() => {
    if (!contributions || contributions.length === 0) {
      return null;
    }

    const calendar = Calendar.fromContributions(contributions[0]);
    for (const contrib of contributions.slice(1)) {
      calendar.updateFromContributions(contrib);
    }
    return calendar;
  }, [contributions]);

  return {
    calendar,
    error,
    loading: !contributions && !error,
  };
}
