import { useMemo, useState } from "react";
import { Calendar, Filter } from "../model.ts";
import { ContributionsGraph } from "./ContributionsGraph.tsx";
import { RepositoryList } from "./RepositoryList.tsx";

export interface ContributionsViewProps {
  calendar: Calendar;
}

/**
 * Displays a contribution graph and repository list with interactive filtering.
 *
 * This component manages the interactive state (highlight and filter) and can be
 * rendered either client-side (with data from React Query) or server-side (with
 * pre-loaded data for static generation).
 */
export function ContributionsView({
  calendar,
}: ContributionsViewProps) {
  const [highlight, setHighlight] = useState<string | null>(null);

  // Initialize filter with all repositories from the calendar.
  const [repoFilter, setRepoFilter] = useState<Filter>(() => {
    const filter = new Filter();
    filter.addReposIfMissing([...calendar.repoUrls()]);
    return filter;
  });

  // Update filter when calendar changes (for client-side incremental loading).
  const currentFilter = useMemo(() => {
    const updated = repoFilter.clone();
    updated.addReposIfMissing([...calendar.repoUrls()]);
    return updated;
  }, [calendar, repoFilter]);

  return (
    <>
      <ContributionsGraph
        calendar={calendar}
        filter={currentFilter}
        highlight={highlight}
      />
      <RepositoryList
        calendar={calendar}
        filter={currentFilter}
        setFilter={setRepoFilter}
        setHighlight={setHighlight}
      />
    </>
  );
}
