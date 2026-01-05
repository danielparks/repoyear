import { useState } from "react";
import { Calendar, Day, Filter } from "../model/index.ts";
import { CalendarHeatMap } from "./CalendarHeatMap.tsx";
import { RepositoryList } from "./RepositoryList.tsx";
import { SummaryBox } from "./SummaryBox.tsx";

export interface Props {
  calendar: Calendar;
}

/**
 * Displays a calendar heat map, summary box, and repository list.
 *
 * This component manages the interactive state (highlight, filter, and selected
 * days) and can use data loaded by the client (via React Query) or data loaded
 * server side and transmitted to the client as JSON.
 */
export function RepoYearView({
  calendar,
}: Props) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => new Filter());
  const [selectedDays, setSelectedDays] = useState<Set<Day>>(() => new Set());
  const [anchorDay, setAnchorDay] = useState<Day | null>(null);

  function handleDayClick(day: Day, event: React.MouseEvent) {
    if (event.shiftKey && anchorDay) {
      // Shift-click: extend selection from anchor to clicked day
      const dayIndex = calendar.days.indexOf(day);
      const anchorIndex = calendar.days.indexOf(anchorDay);
      const start = Math.min(dayIndex, anchorIndex);
      const end = Math.max(dayIndex, anchorIndex);
      const newSelection = new Set(selectedDays);
      for (let i = start; i <= end; i++) {
        newSelection.add(calendar.days[i]);
      }
      setSelectedDays(newSelection);
    } else if (event.metaKey || event.ctrlKey) {
      // Cmd/Ctrl-click: toggle the clicked day
      const newSelection = new Set(selectedDays);
      if (newSelection.has(day)) {
        newSelection.delete(day);
      } else {
        newSelection.add(day);
      }
      setSelectedDays(newSelection);
      setAnchorDay(day);
    } else {
      // Regular click: select only this day (or deselect if it's the only one selected)
      if (selectedDays.size === 1 && selectedDays.has(day)) {
        setSelectedDays(new Set());
        setAnchorDay(null);
      } else {
        setSelectedDays(new Set([day]));
        setAnchorDay(day);
      }
    }
  }

  return (
    <>
      <CalendarHeatMap
        calendar={calendar}
        filter={filter}
        highlight={highlight}
        selectedDays={selectedDays}
        onDayClick={handleDayClick}
      />
      <div className="info-container">
        <SummaryBox
          calendar={calendar}
          filter={filter}
          selectedDays={selectedDays}
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

declare global {
  var setBaseline: (on: boolean) => void;
  interface GlobalThis {
    setBaseline: (on: boolean) => void;
  }
}

/**
 * Called from web inspector to toggle baseline grid.
 */
globalThis.setBaseline = (on: boolean) => {
  const list = document.querySelector(".info-container")!.classList;
  if (on) {
    list.add("baseline");
  } else {
    list.remove("baseline");
  }
};
