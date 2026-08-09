export function conflictPath(originalPath: string, timestamp: Date = new Date()): string {
  if (!originalPath) {
    throw new Error("conflictPath: path must not be empty");
  }

  const lastSlash = originalPath.lastIndexOf("/");
  const directory = lastSlash >= 0 ? originalPath.slice(0, lastSlash + 1) : "";
  const filename = lastSlash >= 0 ? originalPath.slice(lastSlash + 1) : originalPath;

  const lastDot = filename.lastIndexOf(".");
  const hasExtension = lastDot > 0;
  const stem = hasExtension ? filename.slice(0, lastDot) : filename;
  const extension = hasExtension ? filename.slice(lastDot) : "";

  const stamp = formatTimestamp(timestamp);
  return `${directory}${stem} (conflict ${stamp})${extension}`;
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}
