export function formatBytes(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatRate(bytesPerSecond: number) {
  return `${formatBytes(Math.max(0, Math.round(bytesPerSecond)))}/s`;
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 5) return "a few seconds left";
  if (seconds < 60) return `${Math.round(seconds)} sec left`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min left`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours} hr ${minutes} min left`;
}

export function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function formatRemaining(ms: number) {
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours} hr ${minutes} min`;
  return `${Math.max(1, minutes)} min`;
}
