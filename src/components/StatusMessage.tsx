export interface StatusMessageProps {
  type: "error" | "loading";
  message: string;
  title?: string;
}

/**
 * Displays a status message (loading or error state).
 *
 * Used when the app is waiting for data or has encountered an error.
 */
export function StatusMessage({ type, message, title }: StatusMessageProps) {
  return (
    <div className="login-container">
      {title && <h1>{title}</h1>}
      <div className={`${type}-message`}>{message}</div>
    </div>
  );
}
