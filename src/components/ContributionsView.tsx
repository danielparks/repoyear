import { useState } from "react";
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
  const [repoFilter, setRepoFilter] = useState<Filter>(() => new Filter());

  return (
    <>
      <ContributionsGraph
        calendar={calendar}
        filter={repoFilter}
        highlight={highlight}
      />
      <RepositoryList
        calendar={calendar}
        filter={repoFilter}
        setFilter={setRepoFilter}
        setHighlight={setHighlight}
      />
    </>
  );
}
