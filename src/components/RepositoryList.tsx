import { Calendar, Day, Filter, Repository } from "../model.ts";
import { GitHubMark } from "../github/GitHubMark.tsx";

export function RepositoryList(
  { calendar, filter, setFilter, setHighlight }: {
    calendar: Calendar;
    filter: Filter;
    setFilter: React.Dispatch<React.SetStateAction<Filter>>;
    setHighlight: React.Dispatch<React.SetStateAction<string | null>>;
  },
) {
  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const url = event.currentTarget.value;
    const newFilter = filter.clone();
    newFilter.switchRepo(url, event.currentTarget.checked);
    setFilter(newFilter);
  }
  return (
    <ol className="repository-list">
      {calendar.mostUsedRepos().map((repo) => (
        <li key={repo.url}>
          <label
            onMouseEnter={() => {
              setHighlight(repo.url);
            }}
            onMouseLeave={() => {
              // Only unset highlight if it was for this repo.
              setHighlight((old) => old == repo.url ? null : old);
            }}
          >
            <input
              type="checkbox"
              checked={filter.isOn(repo.url) || false}
              value={repo.url}
              onChange={onChange}
            />
            <h3>
              <RepositoryName repo={repo} />
            </h3>
            <Sparkline repo={repo} calendar={calendar} />
          </label>
        </li>
      ))}
    </ol>
  );
}

function RepositoryName({ repo }: { repo: Repository }) {
  return (
    <a style={{ color: repo.color() }} href={repo.url}>
      <GitHubMark />
      {repo.url.replace("https://github.com/", "")}
    </a>
  );
}

function Sparkline({ calendar, repo }: {
  calendar: Calendar;
  repo: Repository;
}) {
  const segments: Day[][] = [];
  const segmentLength = Math.ceil(calendar.days.length / 25);
  for (let i = 0; i < calendar.days.length; i += segmentLength) {
    segments.push(calendar.days.slice(i, i + segmentLength));
  }
  const segmentMax = Math.max(
    ...segments.map((days) =>
      days.reduce((total, day) => total + (day.contributionCount || 0), 0)
    ),
  );

  return (
    <div
      className="sparkline"
      style={{ borderBottomColor: repo.color(80, 0.05) }}
    >
      {segments.map((days) => (
        <SparklineElement
          key={days[0].date.toString()}
          days={days}
          repo={repo}
          max={segmentMax}
        />
      ))}
    </div>
  );
}

function SparklineElement({ days, repo, max }: {
  days: Day[];
  repo: Repository;
  max: number;
}) {
  const filter = Filter.withOnlyRepos(repo.url);
  const count = days.reduce(
    (total, day) => total + day.filteredCount(filter),
    0,
  );
  let height = 0;
  if (count) {
    height = 2 + 98 * count / max;
  }
  return (
    <div>
      <div style={{ height: `${height}%`, background: repo.color() }} />
    </div>
  );
}
