import "./RepositoryList.css";
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
    <div className="repository-list">
      <h2>Visible Repositories</h2>
      <ol>
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
    </div>
  );
}

/**
 * An easy to read, clickable repository name.
 */
export function RepositoryName({ repo }: { repo: Repository }) {
  if (repo.url.startsWith("https://github.com/")) {
    const names = repo.url.slice("https://github.com/".length).split("/");
    return (
      <a style={{ color: repo.color() }} href={repo.url}>
        <GitHubMark />
        {names[0]}/<wbr />
        {names[1]}
      </a>
    );
  } else if (repo.url.startsWith("local:")) {
    const name = repo.url.slice("local:".length);
    return <span style={{ color: repo.color() }}>{name}</span>;
  } else {
    // I don’t think there’s any way to get here.
    return <a style={{ color: repo.color() }} href={repo.url}>{repo.url}</a>;
  }
}
