"use client";

import { useState } from "react";
import Button from "@/components/ui/button";
import { Field, INPUT_LOOK, Select, TextInput } from "@/components/ui/field";
import {
  FormButton,
  FormColumn,
  FormModal,
  useFormSubmit,
} from "@/components/ui/form-modal";
import {
  SPEC_FIELDS,
  STATUSES,
  STATUS_LABEL,
  TYPES,
  TYPE_LABEL,
  createEquipment,
  updateEquipment,
  type Equipment,
  type EquipmentStatus,
  type EquipmentType,
  type SpecField,
  type Specs,
} from "@/lib/equipment";

// Every spec input is held as text while editing and only turned into a
// number, list or boolean on save, so a half typed "1." is not lost.
type Draft = Record<string, string>;
type CustomRow = { key: string; value: string };

function toDraft(fields: SpecField[], specs: Specs): Draft {
  const draft: Draft = {};
  for (const field of fields) {
    const value = specs[field.key];
    if (value === undefined || value === null) continue;
    if (field.kind === "bool") draft[field.key] = value ? "true" : "";
    else if (field.kind === "dims" && Array.isArray(value)) {
      value.forEach((v, i) => (draft[`${field.key}.${i}`] = String(v)));
    } else if (Array.isArray(value)) draft[field.key] = value.join(", ");
    else draft[field.key] = String(value);
  }
  return draft;
}

function toRows(specs: Specs): CustomRow[] {
  return Object.entries(specs).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
  }));
}

// Draft -> specs object, or a message naming the first thing wrong.
function buildSpecs(fields: SpecField[], draft: Draft): Specs | string {
  const specs: Specs = {};
  for (const field of fields) {
    const raw = (draft[field.key] ?? "").trim();
    switch (field.kind) {
      case "bool":
        specs[field.key] = draft[field.key] === "true";
        break;
      case "text":
        if (!raw && field.required) return `${field.label} is required`;
        if (raw) specs[field.key] = raw;
        break;
      case "number": {
        if (!raw) {
          if (field.required) return `${field.label} is required`;
          break;
        }
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) return `${field.label} must be a positive number`;
        if (field.integer && !Number.isInteger(n)) return `${field.label} must be a whole number`;
        specs[field.key] = n;
        break;
      }
      case "dims": {
        const parts = [0, 1, 2].map((i) => (draft[`${field.key}.${i}`] ?? "").trim());
        if (parts.every((p) => !p)) {
          if (field.required) return `${field.label} is required`;
          break;
        }
        const nums = parts.map(Number);
        if (nums.some((n) => !Number.isInteger(n) || n <= 0)) {
          return `${field.label} needs three whole numbers`;
        }
        specs[field.key] = nums;
        break;
      }
      case "list":
        specs[field.key] = raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
    }
  }
  return specs;
}

// Free-form rows: a value that parses as JSON (a number, true, a list) is
// kept as that type, anything else as text.
function buildCustomSpecs(rows: CustomRow[]): Specs | string {
  const specs: Specs = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key && !row.value.trim()) continue;
    if (!key) return "Every detail needs a name";
    if (key in specs) return `"${key}" is listed twice`;
    const value = row.value.trim();
    try {
      specs[key] = JSON.parse(value);
    } catch {
      specs[key] = value;
    }
  }
  return specs;
}

function SpecInput({
  field,
  draft,
  setDraft,
}: {
  field: SpecField;
  draft: Draft;
  setDraft: (key: string, value: string) => void;
}) {
  const label = `${field.label}${"required" in field && field.required ? " *" : ""}`;

  if (field.kind === "bool") {
    return (
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={draft[field.key] === "true"}
          onChange={(e) => setDraft(field.key, e.target.checked ? "true" : "")}
          className="size-4 accent-(--primary-color-1)"
        />
        {field.label}
      </label>
    );
  }

  if (field.kind === "dims") {
    return (
      <Field label={`${label}${field.unit ? ` (${field.unit})` : ""}`}>
        <div className="flex items-center gap-2">
          {["X", "Y", "Z"].map((axis, i) => (
            <input
              key={axis}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              aria-label={`${field.label} ${axis}`}
              placeholder={axis}
              value={draft[`${field.key}.${i}`] ?? ""}
              onChange={(e) => setDraft(`${field.key}.${i}`, e.target.value)}
              className={INPUT_LOOK.filled}
            />
          ))}
        </div>
      </Field>
    );
  }

  if (field.kind === "number") {
    return (
      <Field label={`${label}${field.unit && field.unit !== "×" ? ` (${field.unit})` : ""}`}>
        <input
          type="number"
          min={0}
          step={field.integer ? 1 : "any"}
          inputMode={field.integer ? "numeric" : "decimal"}
          value={draft[field.key] ?? ""}
          onChange={(e) => setDraft(field.key, e.target.value)}
          className={INPUT_LOOK.filled}
        />
      </Field>
    );
  }

  return (
    <TextInput
      label={label}
      value={draft[field.key] ?? ""}
      onChange={(v) => setDraft(field.key, v)}
      placeholder={field.placeholder}
      maxLength={field.kind === "list" ? 300 : 50}
      showCounter={false}
    />
  );
}

export default function EquipmentFormModal({
  item,
  onClose,
  onSaved,
}: {
  // null = adding a new one
  item: Equipment | null;
  onClose: () => void;
  onSaved: (saved: Equipment) => void;
}) {
  const editing = item !== null;
  const [name, setName] = useState(item?.name ?? "");
  const [type, setType] = useState<EquipmentType>(item?.type ?? "microscope");
  const [status, setStatus] = useState<EquipmentStatus>(item?.status ?? "available");
  const [location, setLocation] = useState(item?.location ?? "");
  const [serial, setSerial] = useState(item?.serial_number ?? "");
  const [draft, setDraftState] = useState<Draft>(() =>
    item && item.type !== "other" ? toDraft(SPEC_FIELDS[item.type], item.specs) : {},
  );
  const [rows, setRows] = useState<CustomRow[]>(() =>
    item?.type === "other" && Object.keys(item.specs).length
      ? toRows(item.specs)
      : [{ key: "", value: "" }],
  );
  const { saving, error, setError, run } = useFormSubmit();

  const setDraft = (key: string, value: string) =>
    setDraftState((d) => ({ ...d, [key]: value }));

  async function save(close: () => void) {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const specs =
      type === "other" ? buildCustomSpecs(rows) : buildSpecs(SPEC_FIELDS[type], draft);
    if (typeof specs === "string") {
      setError(specs);
      return;
    }

    const base = {
      name: name.trim(),
      status,
      location: location.trim() || null,
      serial_number: serial.trim() || null,
      specs,
    };

    let saved: Equipment | null = null;
    const ok = await run(async () => {
      saved = editing
        ? await updateEquipment(item.id, base)
        : await createEquipment({ ...base, type });
    }, "Could not save the item.");

    if (ok && saved) {
      onSaved(saved);
      close();
    }
  }

  return (
    <FormModal
      title={editing ? "Edit equipment" : "Add equipment"}
      onClose={onClose}
      error={error}
      footer={(close) => (
        <>
          <FormButton variant="outline-white" onClick={close} disabled={saving}>
            Cancel
          </FormButton>
          <FormButton
            variant={saving ? "busy" : "green"}
            onClick={() => save(close)}
            disabled={saving}
          >
            {saving ? "Saving…" : editing ? "Save" : "Add"}
          </FormButton>
        </>
      )}
    >
      <FormColumn>
        <TextInput label="Name *" value={name} onChange={setName} maxLength={255} />

        {editing ? (
          // Changing type would strand the specs, so it is fixed once made.
          <Field label="Type">
            <p className="rounded-[20px] bg-gray-100 px-3 py-2 text-sm text-gray-600">
              {TYPE_LABEL[type]}
            </p>
          </Field>
        ) : (
          <Select
            label="Type *"
            value={type}
            onChange={(v) => setType(v as EquipmentType)}
            options={TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
          />
        )}

        <Select
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as EquipmentStatus)}
          options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />

        <TextInput
          label="Location"
          value={location}
          onChange={setLocation}
          placeholder="Room 101, bench 3"
          maxLength={255}
        />

        <TextInput
          label="Serial number"
          value={serial}
          onChange={setSerial}
          maxLength={100}
          showCounter={false}
        />
      </FormColumn>

      <FormColumn>
        <h2 className="text-lg font-bold">Specs</h2>

        {type === "other" ? (
          <>
            <p className="-mt-3 text-xs text-gray-500">
              Any details worth keeping. Numbers and true/false are stored as such.
            </p>
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  aria-label={`Detail ${i + 1} name`}
                  placeholder="Name"
                  value={row.key}
                  maxLength={50}
                  onChange={(e) =>
                    setRows((r) => r.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                  }
                  className={INPUT_LOOK.filled}
                />
                <input
                  aria-label={`Detail ${i + 1} value`}
                  placeholder="Value"
                  value={row.value}
                  maxLength={200}
                  onChange={(e) =>
                    setRows((r) => r.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                  className={INPUT_LOOK.filled}
                />
                <Button
                  variant="outline-white"
                  icon="/trash_can.svg"
                  aria-label={`Remove detail ${i + 1}`}
                  className="size-8"
                  onClick={() =>
                    setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [{ key: "", value: "" }]))
                  }
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              icon="/plus.svg"
              className="self-start"
              onClick={() => setRows((r) => [...r, { key: "", value: "" }])}
            >
              Add detail
            </Button>
          </>
        ) : (
          SPEC_FIELDS[type].map((field) => (
            <SpecInput key={field.key} field={field} draft={draft} setDraft={setDraft} />
          ))
        )}
      </FormColumn>
    </FormModal>
  );
}
