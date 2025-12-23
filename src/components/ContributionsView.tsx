import { useState } from "react";
import { Calendar, Day, Filter } from "../model/index.ts";
import { ContributionsGraph } from "./ContributionsGraph.tsx";
import { RepositoryList } from "./RepositoryList.tsx";
import { SummaryBox } from "./SummaryBox.tsx";

export interface ContributionsViewProps {
  calendar: Calendar;
}

/**
 * Displays a contribution graph and repository list with interactive filtering.
 *
 * This component manages the interactive state (highlight, filter, and selected
 * day) and can use data loaded by the client (via React Query) or data loaded
 * server side and transmitted to the client as JSON.
 */
export function ContributionsView({
  calendar,
}: ContributionsViewProps) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => new Filter());
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);

  function handleDayClick(day: Day) {
    setSelectedDay((current) => current === day ? null : day);
  }

  return (
    <>
      <ContributionsGraph
        calendar={calendar}
        filter={filter}
        highlight={highlight}
        selectedDay={selectedDay}
        onDayClick={handleDayClick}
      />
      <div className="info-container">
        <SummaryBox
          calendar={calendar}
          filter={filter}
          selectedDay={selectedDay}
        />
        <RepositoryList
          calendar={calendar}
          filter={filter}
          setFilter={setFilter}
          setHighlight={setHighlight}
        />
      </div>
    </>
  );
}
