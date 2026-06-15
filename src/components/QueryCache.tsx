import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import type { PropsWithChildren } from "react";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";

const IDB_KEY: IDBValidKey = `${location.pathname} contributions`;

export async function clearQueryCache(): Promise<void> {
  await del(IDB_KEY);
}

export default function QueryCacheProvider({ children }: PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // Try to refetch after 6 hours
        staleTime: 1000 * 60 * 60 * 6,
        // Keep data in memory indefinitely (never garbage collect)
        gcTime: Infinity,
        // Retry failed requests once
        retry: 1,
        // Don’t refetch on window focus (contributions don’t change that often)
        refetchOnWindowFocus: false,
        // Refetch when coming back online
        refetchOnReconnect: true,
      },
    },
  });

  const options = {
    persister: {
      persistClient: async (client: PersistedClient) => {
        await set(IDB_KEY, client);
      },
      restoreClient: async () => await get<PersistedClient>(IDB_KEY),
      removeClient: async () => await del(IDB_KEY),
    } as Persister,
    // Keep data in IndexedDB indefinitely
    maxAge: Infinity,
  };

  return (
    <PersistQueryClientProvider client={client} persistOptions={options}>
      {children}
    </PersistQueryClientProvider>
  );
}
