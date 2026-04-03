export function statusLabel(status: string) {
  if (status === "RESOLVED") return "Resolved";
  if (status === "OPEN") return "Open";
  return status;
}

export function statusBadgeClass(status: string, selected: boolean) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide";

  if (status === "RESOLVED") {
    return `${base} ${
      selected
        ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-700"
    }`;
  }

  return `${base} ${
    selected
      ? "border-sky-300 bg-sky-500/20 text-sky-100"
      : "border-sky-200 bg-sky-50 text-sky-700"
  }`;
}

export function formatTimestamp(value: string | null) {
  if (!value) return "-";

  const parsed = new Date(value);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function toInitials(value: string) {
  const parts = value
    .split(" ")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}
