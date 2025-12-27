import { Icon } from "./Icon.tsx";

export interface StatusMessageProps {
  type: "error" | "loading";
  message: string;
  title?: boolean;
}

/**
 * Displays a status message (loading or error state).
 *
 * Used when the app is waiting for data or has encountered an error.
 */
export function StatusMessage({ type, message, title }: StatusMessageProps) {
  return (
    <div className="login-container">
      <div>
        {title && (
          <h1>
            <Icon /> RepoYear
          </h1>
        )}
        <div className={`${type}-message`}>{message}</div>
      </div>
    </div>
  );
}
