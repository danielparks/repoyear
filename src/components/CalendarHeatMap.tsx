import "./CalendarHeatMap.css";
import { Calendar, Day, Filter } from "../model/index.ts";

export interface CalendarHeatMapProps {
  calendar: Calendar;
  filter?: Filter;
  highlight?: string | null;
  clickUrl?: string;
  selectedDays?: Set<Day>;
  onDayClick?: (day: Day, event: React.MouseEvent) => void;
  onDayMouseDown?: (day: Day, event: React.MouseEvent) => void;
  onDayMouseEnter?: (day: Day, event: React.MouseEvent) => void;
}

/**
 * Renders the contribution calendar as a grid of colored cells.
 *
 * Supports optional filtering, highlighting, day selection, and click
 * navigation.
 */
export function CalendarHeatMap(
  {
    calendar,
    filter = new Filter(),
    highlight = null,
    clickUrl,
    selectedDays = new Set(),
    onDayClick,
    onDayMouseDown,
    onDayMouseEnter,
  }: CalendarHeatMapProps,
) {
  const dayMax = calendar.maxContributions();

  const handleClick = clickUrl
    ? () => {
      location.href = clickUrl;
    }
    : undefined;

  return (
    <div
      className="calendar-heat-map"
      onClick={handleClick}
      style={clickUrl ? { cursor: "pointer" } : undefined}
    >
      <div className="weeks" dir="rtl">
        {[...calendar.weeks()].reverse().map((week) => (
          <div key={`week ${week[0].date}`} className="week">
            {week.map((day) => (
              <GraphDay
                key={day.date.toString()}
                day={day}
                filter={filter}
                max={dayMax}
                highlight={highlight}
                selected={selectedDays.has(day)}
                onClick={onDayClick}
                onMouseDown={onDayMouseDown}
                onMouseEnter={onDayMouseEnter}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface GraphDayProps {
  day: Day;
  filter: Filter;
  max: number;
  highlight?: string | null;
  selected?: boolean;
  onClick?: (day: Day, event: React.MouseEvent) => void;
  onMouseDown?: (day: Day, event: React.MouseEvent) => void;
  onMouseEnter?: (day: Day, event: React.MouseEvent) => void;
}

/**
 * Renders a single day cell in the calendar heat map.
 *
 * The cell is subdivided by repository contributions, with hue indicating
 * repository. The entire cell should be perceptually the same lightness, which
 * represents the total number of contributions that day.
 *
 * Can be selected via click.
 */
export function GraphDay(
  {
    day,
    filter,
    max,
    highlight,
    selected = false,
    onClick,
    onMouseDown,
    onMouseEnter,
  }: GraphDayProps,
) {
  const unknownCount = day.unknownCount(); // Not filtered.
  if (day.contributionCount === null) {
    // Day wasn't in calendar summary data. On Sunday morning GitHub returns
    // an extra week of specific contributions.
    if (unknownCount >= 0) {
      // No specific contributions, either.
      return <div></div>;
    }
  }

  const className: string[] = [];
  if (highlight && day.hasRepo(highlight)) {
    className.push("highlight");
  }
  if (selected) {
    className.push("selected");
  }

  const count = day.filteredCount(filter);
  let lightness = 100;
  if (count) {
    lightness = 59 * (1 - count / max) + 40;
  }

  const subdivisions = day.filteredRepos(filter).map((repoDay) => ({
    key: repoDay.url(),
    style: {
      flex: repoDay.count(),
      background: repoDay.repository.color(lightness, 0.1),
    },
  }));

  if (unknownCount > 0) {
    className.push("unknown");

    subdivisions.push({
      key: "unknown",
      style: {
        flex: unknownCount,
        background: `hsl(0deg 0% ${lightness}%)`,
      },
    });
  } else if (subdivisions.length == 0) {
    className.push("empty");
  }

  function handleClick(event: React.MouseEvent) {
    if (onClick) {
      event.stopPropagation();
      onClick(day, event);
    }
  }

  function handleMouseDown(event: React.MouseEvent) {
    if (onMouseDown) {
      event.stopPropagation();
      event.preventDefault();
      onMouseDown(day, event);
    }
  }

  function handleMouseEnter(event: React.MouseEvent) {
    if (onMouseEnter) {
      event.stopPropagation();
      onMouseEnter(day, event);
    }
  }

  return (
    <div
      className={className.join(" ")}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <ol>
        {subdivisions.map(({ key, style }) => <li key={key} style={style} />)}
      </ol>
    </div>
  );
}
