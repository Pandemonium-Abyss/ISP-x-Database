"use client";

import { useEffect, useState } from "react";
import ConfirmModal from "@/components/ui/confirm-modal";
import { INPUT_LOOK, TextArea } from "@/components/ui/field";
import { FormButton, FormColumn, FormModal } from "@/components/ui/form-modal";
import Button from "@/components/ui/button";
import {
  SPEC_FIELDS,
  STATUS_BADGE,
  STATUS_LABEL,
  TYPE_LABEL,
  addMaintenance,
  deleteEquipment,
  formatSpec,
  getEquipment,
  humanizeKey,
  type Equipment,
} from "@/lib/equipment";

function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function StatusBadge({ status }: { status: Equipment["status"] }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-b-0">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium wrap-break-word">{value}</dd>
    </div>
  );
}

export default function EquipmentDetailModal({
  summary,
  isAdmin,
  memberName,
  onClose,
  onEdit,
  onChanged,
  onDeleted,
}: {
  // From the list; the full item (with its log) is fetched on open.
  summary: Equipment;
  isAdmin: boolean;
  memberName: (id: string) => string;
  onClose: () => void;
  onEdit: (item: Equipment) => void;
  onChanged: (item: Equipment) => void;
  onDeleted: () => void;
}) {
  const [item, setItem] = useState<Equipment>(summary);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEquipment(summary.id)
      .then((full) => !cancelled && setItem(full))
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Could not load"));
    return () => {
      cancelled = true;
    };
  }, [summary.id]);

  async function logMaintenance() {
    if (!note.trim()) return;
    setLogging(true);
    setLogError(null);
    try {
      const updated = await addMaintenance(item.id, note.trim(), date || null);
      setItem(updated);
      onChanged(updated);
      setNote("");
      setDate(todayLocal());
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Could not log the maintenance.");
    } finally {
      setLogging(false);
    }
  }

  const fields = item.type === "other" ? [] : SPEC_FIELDS[item.type];
  const specRows =
    item.type === "other"
      ? Object.entries(item.specs).map(([key, value]) => ({ label: humanizeKey(key), value: formatSpec(undefined, value) }))
      : fields.map((field) => ({ label: field.label, value: formatSpec(field, item.specs[field.key]) }));

  return (
    <>
      <FormModal
        title={item.name}
        onClose={onClose}
        error={loadError}
        footer={(close) => (
          <>
            {isAdmin && (
              <>
                <FormButton variant="red" onClick={() => setConfirmDelete(true)}>
                  Delete
                </FormButton>
                <FormButton
                  variant="green"
                  onClick={() => {
                    close();
                    onEdit(item);
                  }}
                >
                  Edit
                </FormButton>
              </>
            )}
            {!isAdmin && (
              <FormButton variant="outline-white" onClick={close}>
                Close
              </FormButton>
            )}
          </>
        )}
      >
        <FormColumn>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            <span className="rounded-full bg-(--panel-bg) px-2.5 py-0.5 text-xs font-semibold text-(--primary-color-deep)">
              {TYPE_LABEL[item.type]}
            </span>
          </div>

          <dl>
            <Row label="Location" value={item.location ?? "—"} />
            <Row label="Serial number" value={item.serial_number ?? "—"} />
            <Row label="Added by" value={memberName(item.created_by)} />
            <Row label="Added" value={new Date(item.created_at).toLocaleDateString()} />
          </dl>

          <h2 className="text-lg font-bold">Specs</h2>
          {specRows.length === 0 ? (
            <p className="text-sm text-gray-500">No details recorded.</p>
          ) : (
            <dl>
              {specRows.map((row) => (
                <Row key={row.label} label={row.label} value={row.value} />
              ))}
            </dl>
          )}
        </FormColumn>

        <FormColumn>
          <h2 className="text-lg font-bold">Maintenance log</h2>

          {isAdmin && (
            <div className="flex flex-col gap-2 rounded-[20px] bg-(--panel-bg) p-3">
              <TextArea
                value={note}
                onChange={setNote}
                maxLength={1000}
                placeholder="What was done?"
                aria-label="Maintenance note"
                className="bg-white"
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={date}
                  max={todayLocal()}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Date of the work"
                  className={`${INPUT_LOOK.filled} bg-white`}
                />
                <Button
                  variant={logging ? "busy" : "green"}
                  size="md"
                  className="px-5 font-semibold"
                  disabled={logging || !note.trim()}
                  onClick={logMaintenance}
                >
                  {logging ? "Logging…" : "Log"}
                </Button>
              </div>
              {logError && <p className="text-sm text-red-500">{logError}</p>}
            </div>
          )}

          {item.maintenance === undefined && !loadError ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : !item.maintenance?.length ? (
            <p className="text-sm text-gray-500">Nothing logged yet.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {item.maintenance.map((entry, i) => (
                <li key={`${entry.date}-${i}`} className="border-l-2 border-(--primary-color-2) pl-3">
                  <p className="text-xs text-gray-500">
                    {new Date(entry.date).toLocaleDateString(undefined, { timeZone: "UTC" })} ·{" "}
                    {memberName(entry.by)}
                  </p>
                  <p className="text-sm whitespace-pre-wrap wrap-break-word">{entry.note}</p>
                </li>
              ))}
            </ol>
          )}
        </FormColumn>
      </FormModal>

      {confirmDelete && (
        <ConfirmModal
          title="Delete equipment?"
          confirmLabel="Delete"
          busyLabel="Deleting…"
          error={deleteError}
          onClose={() => {
            setConfirmDelete(false);
            setDeleteError(null);
          }}
          onConfirm={async () => {
            try {
              await deleteEquipment(item.id);
              onDeleted();
              return true;
            } catch (err) {
              setDeleteError(err instanceof Error ? err.message : "Could not delete the item.");
              return false;
            }
          }}
        >
          <b>{item.name}</b> and its maintenance log will be removed for good.
        </ConfirmModal>
      )}
    </>
  );
}
