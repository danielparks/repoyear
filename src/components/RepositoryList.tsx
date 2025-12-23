import { Calendar, Filter, Repository } from "../model/index.ts";
import { GitHubMark } from "../github/GitHubMark.tsx";

/**
 * Displays a filterable list of repositories.
 *
 * Allows users to toggle repository visibility and highlights repositories
 * on hover.
 */
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
            <span className="contribution-count">
              {repo.contributions}
            </span>
          </label>
        </li>
      ))}
    </ol>
  );
}

/**
 * An easy to read, clickable repository name.
 */
function RepositoryName({ repo }: { repo: Repository }) {
  return (
    <a style={{ color: repo.color() }} href={repo.url}>
      <GitHubMark />
      {repo.url.replace("https://github.com/", "")}
    </a>
  );
}
