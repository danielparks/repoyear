export interface StatusMessageProps {
  type: "error" | "loading";
  message: string;
  title?: string;
}

export function StatusMessage({ type, message, title }: StatusMessageProps) {
  return (
    <div className="login-container">
      {title && <h1>{title}</h1>}
      <div className={`${type}-message`}>{message}</div>
    </div>
  );
}
