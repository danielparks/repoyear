import "./App.css";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { ContributionsView } from "./components/ContributionsView.tsx";
import { Calendar } from "./model.ts";
import type { Contributions } from "./github/api.ts";

export function StaticApp() {
  const [contributions, setContributions] = useState<Contributions[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("assets/contributions.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then((data: Contributions[]) => {
        setContributions(data);
      })
      .catch((error: unknown) => {
        console.error("Error loading assets/contributions.json", error);
        setError("Could not load contributions.");
      });
  }, []);

  const calendar = useMemo(() => {
    if (!contributions || contributions.length === 0) {
      return null;
    }

    const calendar = Calendar.fromContributions(contributions[0]);
    for (const contrib of contributions.slice(1)) {
      calendar.updateFromContributions(contrib);
    }
    return calendar;
  }, [contributions]);

  if (error) {
    return message("error", error);
  } else if (!contributions) {
    return message("loading", "Loading contributions…");
  } else if (!calendar) {
    return message("error", "No contribution data available.");
  }

  return (
    <>
      <header className="app-header">
        <h1>Contribution Graph for {calendar.name}</h1>
      </header>
      <ContributionsView calendar={calendar} />
    </>
  );
}

function message(type: string, message: string) {
  return (
    <div className="login-container">
      <h1>GitHub Contribution Graph</h1>
      <div className={`${type}-message`}>{message}</div>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <StaticApp />
    </ErrorBoundary>
  </StrictMode>,
);
