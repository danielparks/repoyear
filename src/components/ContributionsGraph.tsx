import { Calendar, Day, Filter } from "../model/index.ts";

export interface ContributionsGraphProps {
  calendar: Calendar;
  filter?: Filter;
  highlight?: string | null;
  clickUrl?: string;
}

/**
 * Renders the contribution calendar as a grid of colored cells.
 *
 * Supports optional filtering, highlighting, and click navigation.
 * Can be used in both interactive (with filter/highlight) and static modes.
 */
export function ContributionsGraph(
  {
    calendar,
    filter = new Filter(),
    highlight = null,
    clickUrl,
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
}

/**
 * Renders a single day cell in the contribution graph.
 *
 * The cell is subdivided by repository contributions, with colors indicating
 * intensity.
 */
export function GraphDay(
  { day, filter, max, highlight }: GraphDayProps,
) {
  const className: string[] = [];
  if (highlight && day.hasRepo(highlight)) {
    className.push("highlight");
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

  return (
    <div style={style} className={className.join(" ")}>
      <ol>
        {subdivisions.map(({ key, style }) => <li key={key} style={style} />)}
      </ol>
    </div>
  );
}
