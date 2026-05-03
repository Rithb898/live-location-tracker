export type IncomingLocationPayload = {
  latitude: number;
  longitude: number;
  name?: string;
  color?: string;
  eventId?: string;
  timestamp?: number;
};

export type LocationEvent = {
  eventId: string;
  timestamp: number;
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  color: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isValidIncomingLocationPayload(
  value: unknown,
): value is IncomingLocationPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.latitude !== "number" ||
    !Number.isFinite(payload.latitude)
  )
    return false;
  if (
    typeof payload.longitude !== "number" ||
    !Number.isFinite(payload.longitude)
  )
    return false;
  if (payload.latitude < -90 || payload.latitude > 90) return false;
  if (payload.longitude < -180 || payload.longitude > 180) return false;
  if (
    payload.name !== undefined &&
    (!isNonEmptyString(payload.name) || payload.name.length > 80)
  )
    return false;
  if (payload.color !== undefined && !isValidHexColor(payload.color))
    return false;
  if (payload.eventId !== undefined && !isNonEmptyString(payload.eventId))
    return false;
  if (
    payload.timestamp !== undefined &&
    (typeof payload.timestamp !== "number" ||
      !Number.isFinite(payload.timestamp))
  )
    return false;
  return true;
}

export function isValidLocationEvent(value: unknown): value is LocationEvent {
  if (!value || typeof value !== "object") return false;
  const evt = value as Record<string, unknown>;
  if (!isNonEmptyString(evt.eventId)) return false;
  if (typeof evt.timestamp !== "number" || !Number.isFinite(evt.timestamp))
    return false;
  if (!isNonEmptyString(evt.id)) return false;
  if (typeof evt.latitude !== "number" || typeof evt.longitude !== "number")
    return false;
  if (evt.latitude < -90 || evt.latitude > 90) return false;
  if (evt.longitude < -180 || evt.longitude > 180) return false;
  if (!isNonEmptyString(evt.name)) return false;
  if (!isValidHexColor(evt.color)) return false;
  return true;
}
