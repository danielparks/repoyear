import "./App.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { Footer } from "./components/Footer.tsx";
import { StatusMessage } from "./components/StatusMessage.tsx";
import { useStaticCalendar } from "./hooks/useStaticCalendar.ts";
import { Icon } from "./components/Icon.tsx";
import { getAppVersion } from "./version.ts";
import { RepoYearView } from "./components/RepoYearView.tsx";

export function StaticApp() {
  const { calendar, error, loading, fetchedAt } = useStaticCalendar();

  if (error) {
    return <StatusMessage type="error" message={error} title />;
  } else if (loading) {
    return (
      <StatusMessage type="loading" title message="Loading contributions…" />
    );
  } else if (!calendar) {
    return (
      <StatusMessage
        type="error"
        message="No contribution data available."
        title
      />
    );
  }

  return (
    <>
      <header className="app-header">
        <h1>
          <Icon /> <span>RepoYear:</span> {calendar.name}
        </h1>
      </header>
      <RepoYearView calendar={calendar} />
      <Footer
        version={getAppVersion()}
        lastFetched={fetchedAt}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <StaticApp />
    </ErrorBoundary>
  </StrictMode>,
);
