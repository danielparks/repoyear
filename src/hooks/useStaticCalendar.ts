import { useEffect, useMemo, useState } from "react";
import { Calendar } from "../model/index.ts";
import type { Contributions } from "../github/api.ts";
import type { StaticDataFile } from "../staticData.ts";

export interface UseStaticCalendarResult {
  calendar: Calendar | null;
  error: string | null;
  loading: boolean;
  fetchedAt: string | undefined;
}

/**
 * Fetches and builds a `Calendar` from pre-generated contributions JSON.
 *
 * Used by the static entry points (static.html and compact.html) to load
 * contribution data without requiring GitHub API access.
 */
export function useStaticCalendar(): UseStaticCalendarResult {
  const [contributions, setContributions] = useState<Contributions[] | null>(
    null,
  );
  const [localContributions, setLocalContributions] = useState<
    Record<string, number[]> | null
  >(null);
  const [fetchedAt, setFetchedAt] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  async function loadJson(url: string) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error: unknown) {
      console.error(`Error loading ${url}`, error);
      throw error;
    }
  }

  useEffect(() => {
    loadJson(
      import.meta.env.VITE_CONTRIBUTIONS_URL ||
        "assets/contributions.json",
    )
      .then((data: StaticDataFile) => {
        if (!data.contributions) {
          throw new Error("Invalid contributions data format");
        }
        setContributions(data.contributions);
        setFetchedAt(data.generatedAt);
      })
      .catch((_: unknown) => {
        setError("Could not load contributions.");
      });
  }, []);

  useEffect(() => {
    loadJson(
      import.meta.env.VITE_LOCAL_CONTRIBUTIONS_URL ||
        "assets/local.json",
    )
      .then(setLocalContributions)
      .catch((_: unknown) => {
        setLocalContributions({});
      });
  }, []);

  const calendar = useMemo(() => {
    const calendar = Calendar.fromContributions(...contributions || []);
    if (calendar && localContributions) {
      calendar.updateFromLocal(localContributions);
    }
    return calendar;
  }, [contributions, localContributions]);

  return {
    calendar,
    error,
    loading: !contributions && !error,
    fetchedAt,
  };
}
