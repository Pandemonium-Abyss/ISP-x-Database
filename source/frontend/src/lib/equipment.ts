"use client";

import { apiFetch, apiOrThrow, apiSendJson } from "@/lib/api";
import { buildQuery } from "@/lib/query";

export type EquipmentType = "microscope" | "centrifuge" | "printer_3d" | "other";
export type EquipmentStatus = "available" | "in_use" | "maintenance" | "retired";

export type Specs = Record<string, unknown>;

export type MaintenanceEntry = {
  date: string;
  by: string; // account id
  note: string;
};

export type Equipment = {
  id: string;
  name: string;
  type: EquipmentType;
  status: EquipmentStatus;
  location: string | null;
  serial_number: string | null;
  specs: Specs;
  // Left out of list responses; only a single item carries it.
  maintenance?: MaintenanceEntry[];
  created_by: string;
  created_at: string;
  updated_at: string | null;
};

export const TYPE_LABEL: Record<EquipmentType, string> = {
  microscope: "Microscope",
  centrifuge: "Centrifuge",
  printer_3d: "3D printer",
  other: "Other",
};

export const STATUS_LABEL: Record<EquipmentStatus, string> = {
  available: "Available",
  in_use: "In use",
  maintenance: "Maintenance",
  retired: "Retired",
};

// Badge colours, picked to read at a glance: green go, amber busy, red down,
// grey gone.
export const STATUS_BADGE: Record<EquipmentStatus, string> = {
  available: "bg-green-100 text-green-800",
  in_use: "bg-amber-100 text-amber-800",
  maintenance: "bg-red-100 text-red-800",
  retired: "bg-gray-200 text-gray-600",
};

export const TYPES = Object.keys(TYPE_LABEL) as EquipmentType[];
export const STATUSES = Object.keys(STATUS_LABEL) as EquipmentStatus[];

// ---- specs per type ----
// Mirrors the Pydantic models in equipment_service.py. The backend is the one
// that enforces them; this only decides which inputs the form shows.

export type SpecField =
  | { key: string; label: string; kind: "text"; required?: boolean; placeholder?: string }
  | { key: string; label: string; kind: "number"; required?: boolean; unit?: string; integer?: boolean }
  | { key: string; label: string; kind: "bool" }
  // three whole numbers, stored as [x, y, z]
  | { key: string; label: string; kind: "dims"; required?: boolean; unit?: string }
  // comma separated in the form, stored as a list
  | { key: string; label: string; kind: "list"; placeholder?: string };

export const SPEC_FIELDS: Record<Exclude<EquipmentType, "other">, SpecField[]> = {
  microscope: [
    { key: "kind", label: "Kind", kind: "text", required: true, placeholder: "optical, electron…" },
    { key: "max_magnification", label: "Max magnification", kind: "number", required: true, unit: "×", integer: true },
    { key: "camera", label: "Has a camera", kind: "bool" },
  ],
  centrifuge: [
    { key: "max_rpm", label: "Max speed", kind: "number", required: true, unit: "rpm", integer: true },
    { key: "rotor", label: "Rotor", kind: "text", required: true, placeholder: "fixed-angle, swing-bucket…" },
    { key: "capacity_ml", label: "Capacity", kind: "number", required: true, unit: "mL" },
    { key: "refrigerated", label: "Refrigerated", kind: "bool" },
  ],
  printer_3d: [
    { key: "technology", label: "Technology", kind: "text", required: true, placeholder: "FDM, SLA…" },
    { key: "build_volume_mm", label: "Build volume", kind: "dims", required: true, unit: "mm" },
    { key: "materials", label: "Materials", kind: "list", placeholder: "PLA, PETG" },
  ],
};

// Turn a stored value into something to show.
export function formatSpec(field: SpecField | undefined, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field?.kind === "bool" || typeof value === "boolean") return value ? "Yes" : "No";
  if (field?.kind === "dims" && Array.isArray(value)) {
    return `${value.join(" × ")}${field.unit ? ` ${field.unit}` : ""}`;
  }
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (field?.kind === "number") {
    const n = Number(value).toLocaleString();
    return field.unit ? (field.unit === "×" ? `${n}×` : `${n} ${field.unit}`) : n;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// "max_rpm" -> "Max rpm", for the free-form keys of an "other" item.
export function humanizeKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---- API ----

export type EquipmentFilters = {
  type?: EquipmentType;
  status?: EquipmentStatus;
  search?: string;
};

export async function getEquipmentList(
  filters: EquipmentFilters,
  offset: number,
  limit: number,
): Promise<{ items: Equipment[]; total: number }> {
  const qs = buildQuery({
    type: filters.type,
    status: filters.status,
    search: filters.search?.trim() || undefined,
    offset,
    limit,
  }).toString();
  const res = await apiOrThrow(
    await apiFetch(`/equipment/?${qs}`),
    "Could not load equipment.",
  );
  const body = (await res.json()) as { Equipment: Equipment[]; Total: number };
  return { items: body.Equipment, total: body.Total };
}

export async function getEquipment(id: string): Promise<Equipment> {
  const res = await apiOrThrow(
    await apiFetch(`/equipment/${encodeURIComponent(id)}`),
    "Could not load this item.",
  );
  return ((await res.json()) as { Equipment: Equipment }).Equipment;
}

export type EquipmentInput = {
  name: string;
  type: EquipmentType;
  status: EquipmentStatus;
  location: string | null;
  serial_number: string | null;
  specs: Specs;
};

// FastAPI's 422s carry a list of problems rather than one string, and the
// spec ones are the useful ones here ("specs › max_rpm: ..."), so flatten them.
async function throwDetail(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") message = body.detail;
    else if (Array.isArray(body?.detail) && body.detail.length) {
      message = body.detail
        .map((d: { loc?: unknown[]; msg?: string }) => {
          const field = (d.loc ?? []).filter((p) => p !== "body").join(" › ");
          return field ? `${field}: ${d.msg}` : d.msg;
        })
        .join("; ");
    }
  } catch {
    // no JSON body
  }
  throw new Error(message);
}

export async function createEquipment(input: EquipmentInput): Promise<Equipment> {
  const res = await apiSendJson("/equipment/", "POST", input);
  if (!res.ok) await throwDetail(res, "Could not add the item.");
  return ((await res.json()) as { Equipment: Equipment }).Equipment;
}

export async function updateEquipment(
  id: string,
  input: Omit<EquipmentInput, "type">,
): Promise<Equipment> {
  const res = await apiSendJson(`/equipment/${encodeURIComponent(id)}`, "PUT", input);
  if (!res.ok) await throwDetail(res, "Could not save the item.");
  return ((await res.json()) as { Equipment: Equipment }).Equipment;
}

export async function addMaintenance(
  id: string,
  note: string,
  date: string | null,
): Promise<Equipment> {
  const res = await apiSendJson(
    `/equipment/${encodeURIComponent(id)}/maintenance`,
    "POST",
    date ? { note, date } : { note },
  );
  if (!res.ok) await throwDetail(res, "Could not log the maintenance.");
  return ((await res.json()) as { Equipment: Equipment }).Equipment;
}

export async function deleteEquipment(id: string): Promise<void> {
  await apiOrThrow(
    await apiFetch(`/equipment/${encodeURIComponent(id)}`, { method: "DELETE" }),
    "Could not delete the item.",
  );
}
