export function connectableUrl(raw: string): string {
  const value = raw.trim();
  if (!/^postgres(ql)?:\/\//.test(value)) return value;
  try {
    new URL(value);
    return value;
  } catch {
    const scheme = value.startsWith("postgresql://") ? "postgresql://" : "postgres://";
    const rest = value.slice(scheme.length);
    const at = rest.lastIndexOf("@");
    if (at < 0) return value;
    const auth = rest.slice(0, at);
    const host = rest.slice(at + 1);
    const colon = auth.indexOf(":");
    if (colon < 0) return value;
    return `${scheme}${encodePart(auth.slice(0, colon))}:${encodePart(auth.slice(colon + 1))}@${host}`;
  }
}

function encodePart(value: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}
