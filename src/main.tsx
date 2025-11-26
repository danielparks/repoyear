import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createIDBPersister } from "./utils/persister.ts";
import ErrorBoundary from "./ErrorBoundary.tsx";
import App from "./App.tsx";

// Create a client with appropriate cache times
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 6 hours
      staleTime: 1000 * 60 * 60 * 6,
      // Keep unused data in cache for 24 hours
      gcTime: 1000 * 60 * 60 * 24,
      // Retry failed requests once
      retry: 1,
      // Don't refetch on window focus (contributions don't change that often)
      refetchOnWindowFocus: false,
    },
  },
});

// Create IndexedDB persister for cache persistence across page loads
const persister = createIDBPersister();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24 * 7, // Keep cache for 7 days
        }}
      >
        <App />
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
