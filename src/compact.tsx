import "./App.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { ContributionsGraph } from "./components/ContributionsGraph.tsx";
import { StatusMessage } from "./components/StatusMessage.tsx";
import { useStaticCalendar } from "./hooks/useStaticCalendar.ts";

export function CompactApp() {
  const { calendar, error, loading } = useStaticCalendar();
  const clickUrl = import.meta.env.VITE_CLICK_URL;

  if (error) {
    return <StatusMessage type="error" message={error} />;
  } else if (loading) {
    return <StatusMessage type="loading" message="Loading contributions…" />;
  } else if (!calendar) {
    return (
      <StatusMessage type="error" message="No contribution data available." />
    );
  }

  return (
    <ContributionsGraph
      calendar={calendar}
      clickUrl={clickUrl}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <CompactApp />
    </ErrorBoundary>
  </StrictMode>,
);
