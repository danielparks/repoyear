import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import type { PropsWithChildren } from "react";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";

export default function QueryCacheProvider({ children }: PropsWithChildren) {
  const idbKey: IDBValidKey = `${location.pathname} contributions`;
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // Try to refetch after 6 hours
        staleTime: 1000 * 60 * 60 * 6,
        // Keep data in memory indefinitely (never garbage collect)
        gcTime: Infinity,
        // Retry failed requests once
        retry: 1,
        // Don't refetch on window focus (contributions don't change that often)
        refetchOnWindowFocus: false,
        // Refetch when coming back online
        refetchOnReconnect: true,
      },
    },
  });

  const options = {
    persister: {
      persistClient: async (client: PersistedClient) => {
        await set(idbKey, client);
      },
      restoreClient: async () => {
        return await get<PersistedClient>(idbKey);
      },
      removeClient: async () => {
        await del(idbKey);
      },
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
