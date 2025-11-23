import type { PropsWithChildren } from "react";
import { ErrorBoundary } from "react-error-boundary";

export default function MyErrorBoundary({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary FallbackComponent={Fallback}>
      {children}
    </ErrorBoundary>
  );
}

function Fallback({ error }: { error: { message: string } }) {
  return (
    <main role="alert">
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
    </main>
  );
}
