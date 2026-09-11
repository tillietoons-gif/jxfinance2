"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { ErrorState } from "@/components/shared/ErrorState";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Car,
  Plus,
  Search,
  Trash2,
  Save,
  Copy,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate, VEHICLE_STATUSES } from "@/lib/types";
import { exportToExcel } from "@/lib/excel";
import { VehicleExpensesSheetView } from "@/components/modules/VehicleExpensesSheetView";

interface Customer {
  id: string;
  name: string;
  companyName?: string;
}

interface CompanyLedger {
  id: string;
  name: string;
  type: string;
}

interface Vehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  destination: string;
  status: string;
  notes?: string;
  customer?: { id: string; name: string };
  customerId: string;
  companyLedgerId?: string | null;
  companyLedger?: { id: string; name: string } | null;
  totalCharge: number;
  totalCost: number;
  profit: number;
  createdAt: string;
}

type SheetRow = {
  localId: string;
  isNew: boolean;
  dirty: boolean;
  saving: boolean;
  data: {
    id?: string;
    vin: string;
    make: string;
    model: string;
    year: string;
    destination: string;
    status: string;
    notes: string;
    customerId: string;
    companyLedgerId: string;
    totalCharge: number;
    totalCost: number;
    profit: number;
    createdAt: string;
  };
};

type ColKey =
  | "vin"
  | "make"
  | "model"
  | "year"
  | "destination"
  | "status"
  | "customerId"
  | "companyLedgerId"
  | "notes"
  | "totalCharge"
  | "totalCost"
  | "profit";

const COLUMNS: {
  key: ColKey;
  letter: string;
  header: string;
  width: number;
  editable: boolean;
  type: "text" | "number" | "select" | "readonly";
}[] = [
  { key: "vin", letter: "A", header: "VIN", width: 180, editable: true, type: "text" },
  { key: "make", letter: "B", header: "Make", width: 120, editable: true, type: "text" },
  { key: "model", letter: "C", header: "Model", width: 140, editable: true, type: "text" },
  { key: "year", letter: "D", header: "Year", width: 80, editable: true, type: "number" },
  { key: "destination", letter: "E", header: "Destination", width: 160, editable: true, type: "text" },
  { key: "status", letter: "F", header: "Status", width: 130, editable: true, type: "select" },
  { key: "customerId", letter: "G", header: "Customer", width: 180, editable: true, type: "select" },
  { key: "companyLedgerId", letter: "H", header: "Company", width: 180, editable: true, type: "select" },
  { key: "notes", letter: "I", header: "Notes", width: 180, editable: true, type: "text" },
  { key: "totalCharge", letter: "J", header: "Charge", width: 110, editable: false, type: "readonly" },
  { key: "totalCost", letter: "K", header: "Cost", width: 110, editable: false, type: "readonly" },
  { key: "profit", letter: "L", header: "Profit", width: 110, editable: false, type: "readonly" },
];

function emptyRow(customers: Customer[], ledgers: CompanyLedger[]): SheetRow {
  return {
    localId: `new-${crypto.randomUUID()}`,
    isNew: true,
    dirty: false,
    saving: false,
    data: {
      vin: "",
      make: "",
      model: "",
      year: String(new Date().getFullYear()),
      destination: "",
      status: "PENDING",
      notes: "",
      customerId: customers[0]?.id || "",
      companyLedgerId: ledgers[0]?.id || "",
      totalCharge: 0,
      totalCost: 0,
      profit: 0,
      createdAt: "",
    },
  };
}

function vehicleToRow(v: Vehicle): SheetRow {
  return {
    localId: v.id,
    isNew: false,
    dirty: false,
    saving: false,
    data: {
      id: v.id,
      vin: v.vin || "",
      make: v.make || "",
      model: v.model || "",
      year: String(v.year || ""),
      destination: v.destination || "",
      status: v.status || "PENDING",
      notes: v.notes || "",
      customerId: v.customerId || "",
      companyLedgerId: v.companyLedgerId || "",
      totalCharge: v.totalCharge || 0,
      totalCost: v.totalCost || 0,
      profit: v.profit || 0,
      createdAt: v.createdAt,
    },
  };
}

function cellDisplay(
  row: SheetRow,
  key: ColKey,
  customers: Customer[],
  ledgers: CompanyLedger[]
): string {
  const value = row.data[key];
  if (key === "customerId") {
    return customers.find((c) => c.id === value)?.name || "";
  }
  if (key === "companyLedgerId") {
    return ledgers.find((l) => l.id === value)?.name || "";
  }
  if (key === "status") {
    return String(value || "").replace(/_/g, " ");
  }
  if (key === "totalCharge" || key === "totalCost" || key === "profit") {
    return formatCurrency(Number(value || 0));
  }
  return String(value ?? "");
}

export function VehiclesSheetView() {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companyLedgers, setCompanyLedgers] = useState<CompanyLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [savingAll, setSavingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<"vehicles" | "expenses">("vehicles");
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<SheetRow[]>([]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [vRes, cRes, lRes] = await Promise.all([
        fetch("/api/vehicles"),
        fetch("/api/customers"),
        fetch("/api/ledgers?type=COMPANY"),
      ]);
      if (!vRes.ok || !cRes.ok || !lRes.ok) throw new Error("Failed to load sheet");
      const vehicles: Vehicle[] = await vRes.json();
      const customerList: Customer[] = await cRes.json();
      const ledgerList: CompanyLedger[] = await lRes.json();
      const companies = Array.isArray(ledgerList)
        ? ledgerList.filter((ledger) => ledger.type === "COMPANY")
        : [];
      setCustomers(customerList);
      setCompanyLedgers(companies);
      setRows([...vehicles.map(vehicleToRow), emptyRow(customerList, companies)]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current) inputRef.current.select();
    }
  }, [editing]);

  const filteredIndexes = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        if (row.isNew && !s) return true;
        if (!s) return true;
        const hay = [
          row.data.vin,
          row.data.make,
          row.data.model,
          row.data.year,
          row.data.destination,
          row.data.status,
          row.data.notes,
          customers.find((c) => c.id === row.data.customerId)?.name || "",
          companyLedgers.find((l) => l.id === row.data.companyLedgerId)?.name || "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(s);
      })
      .map(({ index }) => index);
  }, [rows, search, customers, companyLedgers]);

  const dirtyCount = rows.filter((row) => row.dirty && !row.isNew).length;
  const newReadyCount = rows.filter(
    (row) => row.isNew && row.data.vin && row.data.make && row.data.model
  ).length;

  const totals = rows.reduce(
    (acc, row) => {
      if (row.isNew) return acc;
      acc.charge += row.data.totalCharge;
      acc.cost += row.data.totalCost;
      acc.profit += row.data.profit;
      acc.count += 1;
      return acc;
    },
    { charge: 0, cost: 0, profit: 0, count: 0 }
  );

  const formulaValue = (() => {
    if (!selected) return "";
    const row = rows[selected.row];
    const col = COLUMNS[selected.col];
    if (!row || !col) return "";
    return cellDisplay(row, col.key, customers, companyLedgers);
  })();

  const formulaAddress = (() => {
    if (!selected) return "";
    return `${COLUMNS[selected.col]?.letter || ""}${selected.row + 1}`;
  })();

  const persistRow = async (localId: string, nextData?: SheetRow["data"]) => {
    const row = rowsRef.current.find((item) => item.localId === localId);
    if (!row) return;
    const data = nextData || row.data;
    const requiredForNewRow = [
      data.vin,
      data.make,
      data.model,
      data.customerId,
      data.companyLedgerId,
    ].every((value) => String(value ?? "").trim().length > 0);

    // Existing vehicles are already persisted records. A cell edit should not
    // block on a required-field check for unrelated values, especially when a
    // legacy record has an optional company assignment.
    if (row.isNew && !requiredForNewRow) {
      toast.error("VIN, Make, Model, Customer, and Company are required");
      return;
    }
    if (row.isNew) {
      const normalizedVin = data.vin.trim().toUpperCase();
      const existing = rowsRef.current.some(
        (r) =>
          !r.isNew &&
          r.data.vin &&
          r.data.vin.trim().toUpperCase() === normalizedVin &&
          r.localId !== localId
      );
      if (existing) {
        toast.error(`A vehicle with VIN ${normalizedVin} already exists`);
        setRows((current) =>
          current.map((item) =>
            item.localId === localId ? { ...item, saving: false } : item
          )
        );
        return;
      }
    }
    setRows((current) =>
      current.map((item) => (item.localId === localId ? { ...item, saving: true } : item))
    );
    try {
      const payload = {
        vin: data.vin.trim().toUpperCase(),
        make: data.make.trim(),
        model: data.model.trim(),
        year: Number(data.year) || new Date().getFullYear(),
        destination: data.destination.trim(),
        status: data.status || "PENDING",
        notes: data.notes.trim(),
        customerId: data.customerId,
        companyLedgerId: data.companyLedgerId,
      };
      const url = row.isNew ? "/api/vehicles" : `/api/vehicles/${data.id}`;
      const method = row.isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Save failed");
      }
      const saved = await res.json();
      toast.success(row.isNew ? "Vehicle added" : "Vehicle updated");
      setRows((current) => {
        const updated = current.map((item) =>
          item.localId === localId
            ? {
                localId: saved.id,
                isNew: false,
                dirty: false,
                saving: false,
                data: {
                  ...item.data,
                  ...payload,
                  id: saved.id,
                  vin: payload.vin,
                  year: String(payload.year),
                },
              }
            : item
        );
        const hasBlank = updated.some(
          (item) =>
            item.isNew &&
            !item.data.vin &&
            !item.data.make &&
            !item.data.model
        );
        return hasBlank ? updated : [...updated, emptyRow(customers, companyLedgers)];
      });
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
      setRows((current) =>
        current.map((item) => (item.localId === localId ? { ...item, saving: false } : item))
      );
    }
  };

  const commitEdit = async (move?: { row: number; col: number }) => {
    if (!editing) {
      if (move) setSelected(move);
      return;
    }
    const { row, col } = editing;
    const column = COLUMNS[col];
    const current = rowsRef.current[row];
    if (!current || !column.editable) {
      setEditing(null);
      if (move) setSelected(move);
      return;
    }
    let nextValue = draft;
    if (column.key === "vin") nextValue = draft.trim().toUpperCase();
    const changed = String(current.data[column.key] ?? "") !== nextValue;
    const nextData = { ...current.data, [column.key]: nextValue };
    setRows((items) =>
      items.map((item, i) =>
        i === row
          ? { ...item, dirty: item.dirty || changed, data: nextData }
          : item
      )
    );
    setEditing(null);
    if (move) setSelected(move);
    if (changed) {
      await persistRow(current.localId, nextData);
    }
  };

  const startEdit = (rowIndex: number, colIndex: number) => {
    const column = COLUMNS[colIndex];
    const row = rows[rowIndex];
    if (!row || !column?.editable || row.saving) return;
    setSelected({ row: rowIndex, col: colIndex });
    setEditing({ row: rowIndex, col: colIndex });
    setDraft(String(row.data[column.key] ?? ""));
  };

  const deleteRow = async (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (row.isNew) {
      setRows((current) => {
        const next = current.filter((_, i) => i !== index);
        return next.some((item) => item.isNew)
          ? next
          : [...next, emptyRow(customers, companyLedgers)];
      });
      return;
    }
    if (!confirm(`Delete vehicle ${row.data.vin || "this row"}? Related expenses will also be removed.`)) {
      return;
    }
    const res = await fetch(`/api/vehicles/${row.data.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Vehicle deleted");
    setRows((current) => current.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setRows((current) => [...current, emptyRow(customers, companyLedgers)]);
    toast.success("Blank row added");
  };

  const saveAll = async () => {
    setSavingAll(true);
    try {
      const snapshot = rowsRef.current;
      for (const row of snapshot) {
        const ready =
          (!row.isNew && row.dirty) ||
          (row.isNew && row.data.vin && row.data.make && row.data.model);
        if (ready) await persistRow(row.localId, row.data);
      }
    } finally {
      setSavingAll(false);
    }
  };

  const duplicateRow = (index: number) => {
    const source = rows[index];
    if (!source) return;
    const copy: SheetRow = {
      localId: `new-${crypto.randomUUID()}`,
      isNew: true,
      dirty: true,
      saving: false,
      data: {
        ...source.data,
        id: undefined,
        vin: "",
        totalCharge: 0,
        totalCost: 0,
        profit: 0,
        createdAt: "",
      },
    };
    setRows((current) => {
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
    toast.info("Row duplicated — enter a unique VIN to save");
  };

  const handleKeyDown = async (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    const lastCol = COLUMNS.length - 1;
    const lastRow = rows.length - 1;
    const move = (rowDelta: number, colDelta: number) => {
      const nextRow = Math.min(Math.max(selected.row + rowDelta, 0), lastRow);
      const nextCol = Math.min(Math.max(selected.col + colDelta, 0), lastCol);
      return { row: nextRow, col: nextCol };
    };

    if (editing) {
      if (event.key === "Escape") {
        event.preventDefault();
        setEditing(null);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        await commitEdit(move(1, 0));
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        await commitEdit(move(0, event.shiftKey ? -1 : 1));
        return;
      }
      return;
    }

    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      startEdit(selected.row, selected.col);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      setSelected(move(0, event.shiftKey ? -1 : 1));
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSelected(move(0, 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSelected(move(0, -1));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected(move(1, 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected(move(-1, 0));
    } else if (event.key === "Delete" && event.ctrlKey) {
      event.preventDefault();
      await deleteRow(selected.row);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const column = COLUMNS[selected.col];
      if (column.editable && column.type !== "select") {
        setDraft(event.key);
        setEditing(selected);
      }
    }
  };

  const handleExportExcel = async () => {
    const exportRows = rows.filter((row) => !row.isNew);
    await exportToExcel({
      filename: `Vehicles_Sheet_${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Vehicles",
      title: "Vehicle Fleet Sheet",
      subtitle: `Generated ${new Date().toLocaleString()}`,
      columns: [
        { header: "VIN", key: "vin", width: 22 },
        { header: "Make", key: "make", width: 14 },
        { header: "Model", key: "model", width: 18 },
        { header: "Year", key: "year", width: 8 },
        { header: "Destination", key: "destination", width: 20 },
        { header: "Status", key: "status", width: 14 },
        { header: "Customer", key: "customerName", width: 22 },
        { header: "Company", key: "companyName", width: 22 },
        { header: "Notes", key: "notes", width: 28 },
        { header: "Charge", key: "totalCharge", width: 14 },
        { header: "Cost", key: "totalCost", width: 14 },
        { header: "Profit", key: "profit", width: 14 },
        { header: "Created", key: "createdAt", width: 14 },
      ],
      rows: exportRows.map((row) => ({
        ...row.data,
        customerName: customers.find((c) => c.id === row.data.customerId)?.name || "",
        companyName:
          companyLedgers.find((l) => l.id === row.data.companyLedgerId)?.name || "",
        createdAt: formatDate(row.data.createdAt),
      })),
      totals: [
        { label: "Vehicles", value: String(totals.count) },
        { label: "Total Charge", value: formatCurrency(totals.charge) },
        { label: "Total Cost", value: formatCurrency(totals.cost) },
        { label: "Total Profit", value: formatCurrency(totals.profit) },
      ],
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vehicle Sheet"
        subtitle="Excel-style grid to add, edit, and delete vehicles, then assign customer and company"
        icon={Car}
        actions={
          <>
            <ExportButtons onExcel={handleExportExcel} />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={load}>
              <Undo2 className="h-4 w-4" />
              Reload
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={saveAll}
              disabled={savingAll || (dirtyCount === 0 && newReadyCount === 0)}
            >
              <Save className="h-4 w-4" />
              {savingAll ? "Saving…" : "Save all"}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={addRow}>
              <Plus className="h-4 w-4" />
              Add row
            </Button>
          </>
        }
      />

      <div className="flex w-fit items-center gap-1 rounded-lg border border-[#D0D0D0] bg-[#F3F3F3] p-1">
        <button type="button" onClick={() => setActiveTab("vehicles")} className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${activeTab === "vehicles" ? "bg-white text-[#217346] shadow-sm" : "text-[#6B7280] hover:text-[#111827]"}`}>Vehicle Data</button>
        <button type="button" onClick={() => setActiveTab("expenses")} className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${activeTab === "expenses" ? "bg-white text-[#217346] shadow-sm" : "text-[#6B7280] hover:text-[#111827]"}`}>Vehicle Expenses</button>
      </div>

      {activeTab === "expenses" && <VehicleExpensesSheetView />}
      <div className={activeTab === "expenses" ? "hidden" : "contents"}>
      {(customers.length === 0 || companyLedgers.length === 0) && !loading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {customers.length === 0 && "Add at least one customer before saving vehicles. "}
          {companyLedgers.length === 0 && "Create a COMPANY ledger to assign vehicles to a company."}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
          <Input
            placeholder="Filter sheet by VIN, customer, company, destination…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[#4B5563]">
          <span className="rounded-md border border-[#E5E7EB] bg-white px-2 py-1">
            {totals.count} vehicles
          </span>
          <span className="rounded-md border border-[#E5E7EB] bg-white px-2 py-1">
            Charge {formatCurrency(totals.charge)}
          </span>
          <span className="rounded-md border border-[#E5E7EB] bg-white px-2 py-1">
            Cost {formatCurrency(totals.cost)}
          </span>
          <span className="rounded-md border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-2 py-1 font-semibold text-[#92730E]">
            Profit {formatCurrency(totals.profit)}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#B7B7B7] bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-[#D0D0D0] bg-[#F3F3F3] px-3 py-2">
          <div className="w-16 rounded border border-[#C6C6C6] bg-white px-2 py-1 text-center font-mono text-xs text-[#374151]">
            {formulaAddress || "—"}
          </div>
          <div className="flex-1 rounded border border-[#C6C6C6] bg-white px-3 py-1 text-sm text-[#111827]">
            {formulaValue || "Select a cell. Enter or double-click to edit. Tab moves right. Ctrl+Delete removes a row."}
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} />
        ) : error ? (
          <ErrorState onRetry={load} />
        ) : (
          <div
            ref={gridRef}
            className="max-h-[70vh] overflow-auto thin-scroll outline-none"
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <table className="min-w-max border-collapse text-sm">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 w-10 border border-[#C6C6C6] bg-[#E6E6E6] px-1 py-1 text-[10px] font-semibold text-[#6B7280]" />
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      style={{ minWidth: col.width, width: col.width }}
                      className="border border-[#C6C6C6] bg-[#217346] px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-white"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{col.header}</span>
                        <span className="text-[10px] font-normal text-white/70">{col.letter}</span>
                      </div>
                    </th>
                  ))}
                  <th className="sticky right-0 z-30 w-24 border border-[#C6C6C6] bg-[#217346] px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredIndexes.map((rowIndex, visibleIndex) => {
                  const row = rows[rowIndex];
                  return (
                    <tr
                      key={row.localId}
                      className={row.isNew ? "bg-[#F8FFF8]" : visibleIndex % 2 ? "bg-[#FAFAFA]" : "bg-white"}
                    >
                      <td className="sticky left-0 z-10 border border-[#D0D0D0] bg-[#F3F3F3] px-1 py-0 text-center font-mono text-[11px] text-[#6B7280]">
                        {visibleIndex + 1}
                        {row.dirty ? "*" : ""}
                      </td>
                      {COLUMNS.map((col, colIndex) => {
                        const isSelected = selected?.row === rowIndex && selected?.col === colIndex;
                        const isEditing = editing?.row === rowIndex && editing?.col === colIndex;
                        const value = cellDisplay(row, col.key, customers, companyLedgers);
                        return (
                          <td
                            key={col.key}
                            style={{ minWidth: col.width, width: col.width }}
                            className={`border border-[#D0D0D0] p-0 ${
                              isSelected ? "outline outline-2 outline-[#217346] outline-offset-[-2px]" : ""
                            } ${col.type === "readonly" ? "bg-[#F7F7F7]" : ""}`}
                            onClick={() => {
                              setSelected({ row: rowIndex, col: colIndex });
                              if (col.editable) startEdit(rowIndex, colIndex);
                            }}
                            onDoubleClick={() => startEdit(rowIndex, colIndex)}
                          >
                            {isEditing ? (
                              col.key === "status" ? (
                                <select
                                  ref={inputRef as RefObject<HTMLSelectElement>}
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={() => commitEdit()}
                                  className="h-8 w-full bg-[#FFF8DC] px-2 text-sm outline-none"
                                >
                                  {VEHICLE_STATUSES.map((status) => (
                                    <option key={status} value={status}>
                                      {status.replace(/_/g, " ")}
                                    </option>
                                  ))}
                                </select>
                              ) : col.key === "customerId" ? (
                                <select
                                  ref={inputRef as RefObject<HTMLSelectElement>}
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={() => commitEdit()}
                                  className="h-8 w-full bg-[#FFF8DC] px-2 text-sm outline-none"
                                >
                                  <option value="">Select customer</option>
                                  {customers.map((customer) => (
                                    <option key={customer.id} value={customer.id}>
                                      {customer.name}
                                      {customer.companyName ? ` (${customer.companyName})` : ""}
                                    </option>
                                  ))}
                                </select>
                              ) : col.key === "companyLedgerId" ? (
                                <select
                                  ref={inputRef as RefObject<HTMLSelectElement>}
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={() => commitEdit()}
                                  className="h-8 w-full bg-[#FFF8DC] px-2 text-sm outline-none"
                                >
                                  <option value="">Select company</option>
                                  {companyLedgers.map((ledger) => (
                                    <option key={ledger.id} value={ledger.id}>
                                      {ledger.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  ref={inputRef as RefObject<HTMLInputElement>}
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={() => commitEdit()}
                                  type={col.type === "number" ? "number" : "text"}
                                  className="h-8 w-full bg-[#FFF8DC] px-2 font-mono text-sm outline-none"
                                />
                              )
                            ) : (
                              <div
                                className={`flex h-8 items-center truncate px-2 ${
                                  col.type === "readonly" ? "justify-end font-mono text-[#374151]" : ""
                                } ${col.key === "profit" ? "font-semibold text-[#92730E]" : ""} ${
                                  col.key === "totalCost" ? "text-[#DC2626]" : ""
                                } ${row.saving ? "opacity-50" : ""}`}
                              >
                                {value || (row.isNew ? "" : "—")}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 border border-[#D0D0D0] bg-white px-1">
                        <div className="flex h-8 items-center justify-center gap-1">
                          <button
                            type="button"
                            className="rounded p-1 text-[#6B7280] hover:bg-[#F3F4F6]"
                            title="Duplicate row"
                            onClick={() => duplicateRow(rowIndex)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-[#DC2626] hover:bg-[#FEF2F2]"
                            title="Delete row"
                            onClick={() => deleteRow(rowIndex)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="bg-[#E8F5EE] font-semibold">
                  <td className="sticky left-0 border border-[#C6C6C6] bg-[#E8F5EE] px-1 text-center text-[11px]">
                    Σ
                  </td>
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className="border border-[#C6C6C6] px-2 py-1.5 text-right font-mono text-xs"
                    >
                      {col.key === "vin"
                        ? `${totals.count} vehicles`
                        : col.key === "totalCharge"
                          ? formatCurrency(totals.charge)
                          : col.key === "totalCost"
                            ? formatCurrency(totals.cost)
                            : col.key === "profit"
                              ? formatCurrency(totals.profit)
                              : ""}
                    </td>
                  ))}
                  <td className="border border-[#C6C6C6] bg-[#E8F5EE]" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
