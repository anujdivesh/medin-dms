export const formatBytes = (bytes) => {
  if (bytes == null) return ""
  const units = ["bytes", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return unit === 0 ? `${value} bytes` : `${value.toFixed(1)} ${units[unit]}`
}

export const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return ""
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`
}

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : ""

export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : ""
