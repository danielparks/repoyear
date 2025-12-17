import { useEffect, useRef, useState } from "react";
import { Calendar, Day, Filter } from "../model.ts";

export interface ContributionsGraphProps {
  calendar: Calendar;
  filter?: Filter;
  highlight?: string | null;
  clickUrl?: string;
  showTooltip?: boolean;
}

/**
 * Renders the contribution calendar as a grid of colored cells.
 *
 * Supports optional filtering, highlighting, tooltips, and click navigation.
 * Can be used in both interactive (with filter/highlight) and static modes.
 */
export function ContributionsGraph(
  {
    calendar,
    filter = new Filter(),
    highlight = null,
    clickUrl,
    showTooltip = true,
  }: ContributionsGraphProps,
) {
  const dayMax = calendar.maxContributions();

  const handleClick = clickUrl
    ? () => {
      location.href = clickUrl;
    }
    : undefined;

  return (
    <table
      className="contributions"
      onClick={handleClick}
      style={clickUrl ? { cursor: "pointer" } : undefined}
    >
      <tbody>
        {[...calendar.weeks()].map((week) => (
          <tr key={`week ${week[0].date}`} className="week">
            {week.map((day) => (
              <GraphDay
                key={day.date.toString()}
                day={day}
                filter={filter}
                max={dayMax}
                highlight={highlight}
                showTooltip={showTooltip}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface GraphDayProps {
  day: Day;
  filter: Filter;
  max: number;
  highlight?: string | null;
  showTooltip?: boolean;
}

/**
 * Renders a single day cell in the contribution graph.
 *
 * The cell is subdivided by repository contributions, with colors indicating
 * intensity. Optionally shows a tooltip on hover with contribution details.
 */
export function GraphDay(
  { day, filter, max, highlight, showTooltip = true }: GraphDayProps,
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
    <td style={style} className={className.join(" ")}>
      {showTooltip && <DayInfo day={day} />}
      <ol>
        {subdivisions.map(({ key, style }) => <li key={key} style={style} />)}
      </ol>
    </td>
  );
}

/**
 * Tooltip displaying detailed contribution information for a day.
 *
 * Automatically positions itself to avoid overflowing the window.
 */
function DayInfo({ day }: { day: Day }) {
  const divRef = useRef<HTMLDivElement>(null);
  const [classNames, setClassNames] = useState(["day-info"]);

  useEffect(() => {
    function checkOverflow() {
      if (divRef.current && divRef.current.parentNode) {
        const rect = (divRef.current.parentNode as HTMLTableCellElement)
          .getBoundingClientRect();
        const newClassNames = ["day-info", "align-top"];
        // FIXME: this assumes the window is large enough.
        if (rect.right > globalThis.innerWidth - 460) {
          newClassNames.push("align-right");
        } else {
          newClassNames.push("align-left");
        }
        setClassNames(newClassNames);
      }
    }

    checkOverflow();
    addEventListener("resize", checkOverflow);

    return () => {
      removeEventListener("resize", checkOverflow);
    };
  }, []);

  return (
    <div ref={divRef} className={classNames.join(" ")}>
      <table>
        <tbody>
          {[...day.repositories.values()].map((repoDay) => (
            <tr key={repoDay.repository.url}>
              <td className="count">
                {repoDay.count()}
              </td>
              <th>
                {repoDay.repository.url} {repoDay.created > 0 && <>(Created)</>}
              </th>
            </tr>
          ))}
          {day.addsUp() ||
            (
              <tr key="unknown">
                <td className="count">
                  {(day.contributionCount || 0) - day.knownContributionCount()}
                </td>
                <th>
                  Unknown contributions
                </th>
              </tr>
            )}
        </tbody>
        <tfoot>
          <tr>
            <td className="count">
              {day.contributionCount}
            </td>
            <th className="date">{day.date.toLocaleDateString()}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
