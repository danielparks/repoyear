import { Calendar, Day, Filter } from "../model/index.ts";

export interface ContributionsGraphProps {
  calendar: Calendar;
  filter?: Filter;
  highlight?: string | null;
  clickUrl?: string;
  selectedDay?: Day | null;
  onDayClick?: (day: Day) => void;
}

/**
 * Renders the contribution calendar as a grid of colored cells.
 *
 * Supports optional filtering, highlighting, day selection, and click navigation.
 * Can be used in both interactive (with filter/highlight/selection) and static modes.
 */
export function ContributionsGraph(
  {
    calendar,
    filter = new Filter(),
    highlight = null,
    clickUrl,
    selectedDay = null,
    onDayClick,
  }: ContributionsGraphProps,
) {
  const dayMax = calendar.maxContributions();

  const handleClick = clickUrl
    ? () => {
      location.href = clickUrl;
    }
    : undefined;

  return (
    <div
      className="contributions-graph"
      onClick={handleClick}
      style={clickUrl ? { cursor: "pointer" } : undefined}
    >
      <div className="weeks">
        {[...calendar.weeks()].map((week) => (
          <div key={`week ${week[0].date}`} className="week">
            {week.map((day) => (
              <GraphDay
                key={day.date.toString()}
                day={day}
                filter={filter}
                max={dayMax}
                highlight={highlight}
                selected={selectedDay === day}
                onClick={onDayClick}
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
  onClick?: (day: Day) => void;
}

/**
 * Renders a single day cell in the contribution graph.
 *
 * The cell is subdivided by repository contributions, with hue indicating
 * repository. The entire cell should be perceptually the same lightness, which
 * represents the total number of contributions that day.
 *
 * Can be selected via click.
 */
export function GraphDay(
  { day, filter, max, highlight, selected = false, onClick }: GraphDayProps,
) {
  const className: string[] = [];
  if (highlight && day.hasRepo(highlight)) {
    className.push("highlight");
  }
  if (selected) {
    className.push("selected");
  }

  /**
   * Converts a contribution count to an OKLCH lightness value (40-100%).
   *
   * Higher contribution counts result in darker colors.
   */
  function countToLightness(count: number) {
    if (count) {
      return 59 * (1 - count / max) + 40;
    } else {
      return 100;
    }
  }

  interface Subdivision {
    key: string;
    style: React.CSSProperties;
  }
  let subdivisions: Subdivision[] = [];
  let style = {};
  if (day.addsUp()) {
    subdivisions = day.filteredRepos(filter).map((repoDay) => ({
      key: repoDay.url(),
      style: {
        flex: repoDay.count(),
        background: repoDay.repository.color(
          countToLightness(day.filteredCount(filter)),
          0.1,
        ),
      },
    }));

    if (subdivisions.length == 0) {
      className.push("empty");
    }
  } else {
    const lightness = countToLightness(day.contributionCount || 0);
    className.push("unknown");
    style = {
      background: `hsl(270deg 40% ${lightness}%)`,
    };

    if (day.contributionCount === 0) {
      className.push("empty");
    }
  }

  function handleClick(event: React.MouseEvent) {
    if (onClick) {
      event.stopPropagation();
      onClick(day);
    }
  }

  return (
    <div
      style={style}
      className={className.join(" ")}
      onClick={handleClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <ol>
        {subdivisions.map(({ key, style }) => <li key={key} style={style} />)}
      </ol>
    </div>
  );
}
