import { Calendar, Filter } from "../model.ts";
import { GraphDay } from "./ContributionsGraph.tsx";

export function CompactGraph(
  { calendar, clickUrl }: {
    calendar: Calendar;
    clickUrl?: string;
  },
) {
  const dayMax = calendar.maxContributions();
  const filter = new Filter();

  const handleClick = clickUrl
    ? () => {
      globalThis.location.href = clickUrl;
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
                showTooltip={false}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
