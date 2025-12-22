function formatTimestamp(timestamp: number | string): string {
  return new Date(timestamp).toLocaleString();
}

export function Footer(
  { version, lastFetched }: { version: string; lastFetched?: number | string },
) {
  return (
    <footer>
      <a href="https://github.com/danielparks/contributions-tracker">
        github.com/danielparks/contributions-tracker
      </a>{" "}
      • {version}
      {lastFetched && ` • Last updated ${formatTimestamp(lastFetched)}`}
    </footer>
  );
}
