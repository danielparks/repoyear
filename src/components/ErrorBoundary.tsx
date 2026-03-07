import type { PropsWithChildren } from "react";
import {
  ErrorBoundary,
  type FallbackProps,
  getErrorMessage,
} from "react-error-boundary";

export default function MyErrorBoundary({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary FallbackComponent={Fallback}>
      {children}
    </ErrorBoundary>
  );
}

function Fallback({ error }: FallbackProps) {
  return (
    <main role="alert">
      <h2>Something went wrong</h2>
      <pre>{getErrorMessage(error)}</pre>
    </main>
  );
}
