import { useEffect, useState } from "react";
import { Calendar, Day, Filter } from "../model/index.ts";
import { CalendarHeatMap } from "./CalendarHeatMap.tsx";
import { RepositoryList } from "./RepositoryList.tsx";
import { SummaryBox } from "./SummaryBox.tsx";

export interface Props {
  calendar: Calendar;
}

interface DragInfo {
  originalSelection: Set<Day>;
  startDay: Day;
  ctrl: boolean;
  shift: boolean;
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
  const [currentDrag, setCurrentDrag] = useState<DragInfo | null>(null);
  const [hasDragged, setHasDragged] = useState(false);

  function makeDaySet(...days: Day[]): Set<Day> {
    const indices = days.map((day) => calendar.dayToIndex(day));
    const start = Math.min(...indices);
    const end = Math.max(...indices);

    const newSet = new Set<Day>();
    for (let i = start; i <= end; i++) {
      newSet.add(calendar.days[i]);
    }
    return newSet;
  }

  function handleDayClick(day: Day, event: React.MouseEvent) {
    // Don't handle click if we just completed a drag
    if (hasDragged) {
      setHasDragged(false);
      return;
    }

    if (event.shiftKey && anchorDay) {
      // Shift-click: extend selection from anchor to clicked day
      setSelectedDays(makeDaySet(day, anchorDay).union(selectedDays));
    } else if (event.metaKey || event.ctrlKey) {
      // Command/Control-click: toggle the clicked day
      const newSelection = new Set(selectedDays);
      if (!newSelection.delete(day)) {
        newSelection.add(day);
      }

      setSelectedDays(newSelection);
      setAnchorDay(day);
    } else {
      // Regular click: select only this day (or deselect it if it's the only
      // one selected).
      if (selectedDays.size === 1 && selectedDays.has(day)) {
        setSelectedDays(new Set());
        setAnchorDay(null);
      } else {
        setSelectedDays(new Set([day]));
        setAnchorDay(day);
      }
    }
  }

  function handleDayMouseDown(day: Day, event: React.MouseEvent) {
    setCurrentDrag({
      originalSelection: selectedDays,
      startDay: day,
      ctrl: event.metaKey || event.ctrlKey,
      shift: event.shiftKey,
    });
    setHasDragged(false);
  }

  function handleDayMouseEnter(day: Day) {
    if (!currentDrag) {
      return;
    }

    // Mark that we've dragged to a different day
    if (day !== currentDrag.startDay) {
      setHasDragged(true);
    }

    if (currentDrag.shift && anchorDay) {
      // Shift-drag: extend from anchor to include drag range
      setSelectedDays(
        makeDaySet(day, currentDrag.startDay, anchorDay).union(
          currentDrag.originalSelection,
        ),
      );
    } else if (currentDrag.ctrl) {
      // Ctrl-drag: add range to existing selection
      setSelectedDays(
        makeDaySet(day, currentDrag.startDay).union(
          currentDrag.originalSelection,
        ),
      );
    } else {
      // Regular drag: select only the range
      setSelectedDays(makeDaySet(day, currentDrag.startDay));
    }
  }

  function handleMouseUp() {
    if (currentDrag && hasDragged) {
      setAnchorDay(currentDrag.startDay);
    }
    setCurrentDrag(null);
  }

  useEffect(() => {
    globalThis.addEventListener("mouseup", handleMouseUp);
    return () => {
      globalThis.removeEventListener("mouseup", handleMouseUp);
    };
  });

  return (
    <>
      <CalendarHeatMap
        calendar={calendar}
        filter={filter}
        highlight={highlight}
        selectedDays={selectedDays}
        onDayClick={handleDayClick}
        onDayMouseDown={handleDayMouseDown}
        onDayMouseEnter={handleDayMouseEnter}
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
