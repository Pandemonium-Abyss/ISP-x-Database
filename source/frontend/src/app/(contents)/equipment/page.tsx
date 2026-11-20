"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import EquipmentDetailModal, { StatusBadge } from "@/components/equipment/EquipmentDetailModal";
import EquipmentFormModal from "@/components/equipment/EquipmentFormModal";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { INPUT_LOOK, Select } from "@/components/ui/field";
import { useCurrentAccount, useMembers } from "@/lib/account";
import {
  SPEC_FIELDS,
  STATUSES,
  STATUS_LABEL,
  TYPES,
  TYPE_LABEL,
  formatSpec,
  getEquipment,
  getEquipmentList,
  humanizeKey,
  type Equipment,
  type EquipmentFilters,
  type EquipmentStatus,
  type EquipmentType,
} from "@/lib/equipment";

const PAGE_SIZE = 24;
const SEARCH_DELAY_MS = 300;

// The two or three specs worth seeing without opening the item.
function headlineSpecs(item: Equipment): string {
  const parts =
    item.type === "other"
      ? Object.entries(item.specs)
          .slice(0, 2)
          .map(([k, v]) => `${humanizeKey(k)}: ${formatSpec(undefined, v)}`)
      : SPEC_FIELDS[item.type]
          .filter((f) => f.kind !== "bool" && item.specs[f.key] !== undefined)
          .slice(0, 2)
          .map((f) => formatSpec(f, item.specs[f.key]));
  return parts.join(" · ");
}

function EquipmentCard({ item, onOpen }: { item: Equipment; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col gap-2 rounded-[20px] bg-(--panel-bg) p-4 text-left transition-colors hover:bg-(--panel-bg-hover)"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-2 text-base font-bold wrap-break-word">{item.name}</h2>
          <StatusBadge status={item.status} />
        </div>
        <p className="text-xs font-semibold text-(--primary-color-deep)">{TYPE_LABEL[item.type]}</p>
        <p className="text-sm text-gray-600">{headlineSpecs(item) || "No details recorded"}</p>
        <p className="mt-auto text-xs text-gray-500">{item.location ?? "No location set"}</p>
      </button>
    </li>
  );
}

export default function EquipmentPage() {
  const { isAdmin } = useCurrentAccount();
  const { members } = useMembers();

  const [type, setType] = useState<EquipmentType | "">("");
  const [status, setStatus] = useState<EquipmentStatus | "">("");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");

  const [items, setItems] = useState<Equipment[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Which filters the list on screen belongs to; while it trails the current
  // ones, the first page is still loading.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retry, setRetry] = useState(0);

  const [selected, setSelected] = useState<Equipment | null>(null);
  const [form, setForm] = useState<{ item: Equipment | null } | null>(null);
  const [linkError, setLinkError] = useState(false);

  // Typing only searches once it pauses.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchText), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const filters = useMemo<EquipmentFilters>(
    () => ({ type: type || undefined, status: status || undefined, search: search || undefined }),
    [type, status, search],
  );

  const filtersKey = JSON.stringify(filters);
  const loading = loadedKey !== `${filtersKey}#${retry}`;

  // Bumped on every new request, so a slow answer to an old filter never
  // overwrites a newer one.
  const requestId = useRef(0);

  // First page, whenever the filters change (or Retry is pressed). State is
  // only set once the answer is in.
  useEffect(() => {
    const id = ++requestId.current;
    const key = `${filtersKey}#${retry}`;
    getEquipmentList(filters, 0, PAGE_SIZE)
      .then((page) => {
        if (id !== requestId.current) return;
        setItems(page.items);
        setTotal(page.total);
        setError(null);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        setItems([]);
        setError(err instanceof Error ? err.message : "Could not load equipment.");
      })
      .finally(() => {
        if (id === requestId.current) setLoadedKey(key);
      });
  }, [filters, filtersKey, retry]);

  const reload = () => setRetry((n) => n + 1);

  async function loadMore() {
    const id = ++requestId.current;
    setLoadingMore(true);
    try {
      const page = await getEquipmentList(filters, items.length, PAGE_SIZE);
      if (id !== requestId.current) return;
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch (err) {
      if (id === requestId.current) {
        setError(err instanceof Error ? err.message : "Could not load equipment.");
      }
    } finally {
      setLoadingMore(false);
    }
  }

  // Opened from a link such as /equipment/<id>.
  const idParam = useParams<{ id?: string }>().id;
  useEffect(() => {
    if (!idParam) return;
    let cancelled = false;
    getEquipment(idParam)
      .then((item) => !cancelled && setSelected(item))
      .catch(() => !cancelled && setLinkError(true));
    return () => {
      cancelled = true;
    };
  }, [idParam]);

  const clearLink = () => {
    if (idParam) window.history.replaceState(null, "", "/equipment");
  };

  const memberName = useCallback(
    (id: string) => members.find((m) => m.id === id)?.name ?? "Unknown",
    [members],
  );

  // Keep a saved item in place in the list rather than refetching it all.
  const replaceItem = (saved: Equipment) =>
    setItems((list) => list.map((i) => (i.id === saved.id ? { ...i, ...saved } : i)));

  const filtered = type !== "" || status !== "" || search !== "";

  return (
    <div className="flex h-full w-full flex-col gap-4 bg-white px-5 pt-5 pb-8 text-gray-900">
      <div className="flex flex-wrap items-center gap-3 rounded-[20px] bg-(--primary-color-3) p-3">
        <div className="relative min-w-48 flex-1">
          <Icon
            src="/search.svg"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-50"
          />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            maxLength={100}
            placeholder="Search name or location"
            aria-label="Search equipment"
            className={`${INPUT_LOOK.panel} pl-9`}
          />
        </div>

        <div className="flex w-full gap-3 sm:w-auto">
          <Select
            look="panel"
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            value={type}
            onChange={(v) => setType(v as EquipmentType | "")}
            placeholder={{ value: "", label: "All types" }}
            firstItem={{ value: "", label: "All types" }}
            options={TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
            aria-label="Filter by type"
          />
          <Select
            look="panel"
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            value={status}
            onChange={(v) => setStatus(v as EquipmentStatus | "")}
            placeholder={{ value: "", label: "All statuses" }}
            firstItem={{ value: "", label: "All statuses" }}
            options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            aria-label="Filter by status"
          />
        </div>

        {isAdmin && (
          <Button
            variant="green"
            icon="/plus.svg"
            iconColor="white"
            // no size prop: md would draw the icon 32px tall; this keeps it 16px
            className="h-9 px-5 text-base font-semibold"
            onClick={() => setForm({ item: null })}
          >
            Add equipment
          </Button>
        )}
      </div>

      <p className="text-sm text-gray-500" aria-live="polite">
        {loading && items.length === 0
          ? "Loading…"
          : `${total} item${total === 1 ? "" : "s"}${filtered ? " match" : ""}`}
      </p>

      {error && (
        <div className="flex items-center gap-3 rounded-[20px] bg-red-50 p-4 text-sm text-red-700">
          {error}
          <Button variant="outline-white" size="sm" onClick={reload}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <p className="text-lg font-semibold">
            {filtered ? "Nothing matches these filters." : "No equipment yet."}
          </p>
          {!filtered && isAdmin && <p className="text-sm">Use “Add equipment” to record the first item.</p>}
        </div>
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
          {items.map((item) => (
            <EquipmentCard key={item.id} item={item} onOpen={() => setSelected(item)} />
          ))}
        </ul>
      )}

      {!loading && items.length < total && (
        <Button
          variant="outline"
          size="md"
          className="self-center px-6"
          disabled={loadingMore}
          onClick={loadMore}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}

      {selected && (
        <EquipmentDetailModal
          key={selected.id}
          summary={selected}
          isAdmin={isAdmin}
          memberName={memberName}
          onClose={() => {
            clearLink();
            setSelected(null);
          }}
          onEdit={(item) => {
            setSelected(null);
            setForm({ item });
          }}
          onChanged={replaceItem}
          onDeleted={() => {
            clearLink();
            setSelected(null);
            reload();
          }}
        />
      )}

      {form && (
        <EquipmentFormModal
          item={form.item}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            if (form.item) replaceItem(saved);
            else reload();
            setSelected(saved);
          }}
        />
      )}

      {linkError && (
        <div className="fixed inset-x-0 bottom-6 z-40 mx-auto w-fit rounded-full bg-black px-5 py-2 text-sm text-white">
          That equipment could not be found.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              clearLink();
              setLinkError(false);
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
