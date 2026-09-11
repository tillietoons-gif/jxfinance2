"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { ErrorState } from "@/components/shared/ErrorState";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/types";
import { exportToExcel } from "@/lib/excel";

type Vehicle = {
  id: string;
  vin: string;
  make: string;
  model: string;
  year?: number;
  customer?: { id: string; name: string };
  customerId: string;
  companyLedger?: { id: string; name: string } | null;
  companyLedgerId?: string | null;
  totalCharge?: number;
  totalCost?: number;
  profit?: number;
};

type Expense = {
  id: string;
  vehicleId: string;
  title: string;
  category?: string | null;
  vendor?: { name: string } | null;
  vendorId?: string | null;
  receiptUrl?: string | null;
  customerCharge: number;
  companyCost: number;
  profit: number;
  notes?: string | null;
  createdAt: string;
};

type ExpenseRow = Expense & { isNew?: boolean; dirty?: boolean; saving?: boolean };

const EXPENSE_CATEGORIES = ["Freight", "Customs", "Storage", "Repair", "Insurance", "Other"];

const SUMMARY_COLUMNS = [
  { key: "customer", letter: "A", header: "Customer", width: 200 },
  { key: "company", letter: "B", header: "Company", width: 200 },
  { key: "vin", letter: "C", header: "VIN", width: 180 },
  { key: "charge", letter: "D", header: "Customer Charge", width: 150 },
  { key: "cost", letter: "E", header: "Company Cost", width: 140 },
  { key: "profit", letter: "F", header: "Profit", width: 140 },
] as const;

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const blankExpense = (vehicleId: string): ExpenseRow => ({
  id: `new-${crypto.randomUUID()}`,
  vehicleId,
  title: "",
  category: "",
  customerCharge: 0,
  companyCost: 0,
  profit: 0,
  notes: "",
  createdAt: new Date().toISOString(),
  isNew: true,
  dirty: true,
  saving: false,
});

export function VehicleExpensesSheetView() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setErrorMessage("");
    try {
      const [vehiclesResponse, expensesResponse] = await Promise.all([
        fetch("/api/vehicles"),
        fetch("/api/expenses"),
      ]);
      if (!vehiclesResponse.ok || !expensesResponse.ok) {
        throw new Error("Unable to load vehicle expenses");
      }
      const vehicleList: Vehicle[] = await vehiclesResponse.json();
      const expenseList: Expense[] = await expensesResponse.json();
      if (!Array.isArray(vehicleList) || !Array.isArray(expenseList)) {
        throw new Error("Unexpected response while loading expenses");
      }
      setVehicles(vehicleList);
      setExpenses(
        expenseList.map((expense) => ({
          ...expense,
          isNew: false,
          dirty: false,
          saving: false,
        }))
      );
    } catch (err) {
      setError(true);
      setErrorMessage(err instanceof Error ? err.message : "Unable to load expenses");
      toast.error(err instanceof Error ? err.message : "Unable to load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const expensesByVehicle = useMemo(() => {
    const map = new Map<string, ExpenseRow[]>();
    for (const expense of expenses) {
      const list = map.get(expense.vehicleId) || [];
      list.push(expense);
      map.set(expense.vehicleId, list);
    }
    return map;
  }, [expenses]);

  const summaries = useMemo(() => {
    return vehicles.map((vehicle) => {
      const rows = expensesByVehicle.get(vehicle.id) || [];
      const charge = rows.reduce((sum, row) => sum + toNum(row.customerCharge), 0);
      const cost = rows.reduce((sum, row) => sum + toNum(row.companyCost), 0);
      return {
        vehicle,
        customer: vehicle.customer?.name || "—",
        company: vehicle.companyLedger?.name || "—",
        vin: vehicle.vin || "—",
        charge,
        cost,
        profit: charge - cost,
        count: rows.filter((row) => !row.isNew).length,
        dirtyCount: rows.filter((row) => row.dirty).length,
        expenses: rows,
      };
    });
  }, [vehicles, expensesByVehicle]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return summaries;
    return summaries.filter((row) =>
      [row.customer, row.company, row.vin, row.vehicle.make, row.vehicle.model]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [summaries, search]);

  const totals = filtered.reduce(
    (acc, row) => {
      acc.charge += row.charge;
      acc.cost += row.cost;
      acc.profit += row.profit;
      acc.count += 1;
      return acc;
    },
    { charge: 0, cost: 0, profit: 0, count: 0 }
  );

  const dirtyCount = expenses.filter((row) => row.dirty).length;
  const expanded = summaries.find((row) => row.vehicle.id === expandedId) || null;

  const toggleExpand = (vehicleId: string) => {
    setExpandedId((current) => (current === vehicleId ? null : vehicleId));
  };

  const updateExpense = (id: string, field: keyof ExpenseRow, value: string | number) => {
    setExpenses((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const next: ExpenseRow = { ...row, [field]: value, dirty: true };
        if (field === "customerCharge" || field === "companyCost") {
          const charge = field === "customerCharge" ? toNum(value) : toNum(row.customerCharge);
          const cost = field === "companyCost" ? toNum(value) : toNum(row.companyCost);
          next.customerCharge = charge;
          next.companyCost = cost;
          next.profit = charge - cost;
        }
        return next;
      })
    );
  };

  const addExpense = (vehicleId: string) => {
    const row = blankExpense(vehicleId);
    setExpenses((current) => [row, ...current]);
    setExpandedId(vehicleId);
    toast.success("Blank expense row added");
  };

  const saveExpense = async (row: ExpenseRow) => {
    if (!row.vehicleId || !row.title.trim()) {
      toast.error("Expense title is required");
      return false;
    }
    const payload = {
      vehicleId: row.vehicleId,
      title: row.title.trim(),
      category: row.category || "",
      vendorId: row.vendorId || "",
      receiptUrl: row.receiptUrl || "",
      customerCharge: toNum(row.customerCharge),
      companyCost: toNum(row.companyCost),
      notes: row.notes || "",
    };
    setExpenses((current) =>
      current.map((item) => (item.id === row.id ? { ...item, saving: true } : item))
    );
    try {
      const response = await fetch(row.isNew ? "/api/expenses" : `/api/expenses/${row.id}`, {
        method: row.isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || "Save failed");
      }
      const saved = await response.json();
      setExpenses((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, ...saved, isNew: false, dirty: false, saving: false }
            : item
        )
      );
      toast.success(row.isNew ? "Expense added" : "Expense updated");
      return true;
    } catch (err) {
      setExpenses((current) =>
        current.map((item) => (item.id === row.id ? { ...item, saving: false } : item))
      );
      toast.error(err instanceof Error ? err.message : "Save failed");
      return false;
    }
  };

  const deleteExpense = async (row: ExpenseRow) => {
    if (row.isNew) {
      setExpenses((current) => current.filter((item) => item.id !== row.id));
      return;
    }
    if (!confirm(`Delete ${row.title || "this expense"}? Ledger entries will be reversed.`)) {
      return;
    }
    try {
      const response = await fetch(`/api/expenses/${row.id}`, { method: "DELETE" });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || "Delete failed");
      }
      setExpenses((current) => current.filter((item) => item.id !== row.id));
      toast.success("Expense deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const saveAll = async () => {
    const dirty = expenses.filter((row) => row.dirty);
    if (dirty.length === 0) return;
    const incomplete = dirty.find((row) => !row.title.trim());
    if (incomplete) {
      toast.error("Every dirty expense needs a title before saving");
      setExpandedId(incomplete.vehicleId);
      return;
    }
    setSavingAll(true);
    try {
      for (const row of dirty) {
        const ok = await saveExpense(row);
        if (!ok) break;
      }
    } finally {
      setSavingAll(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      await exportToExcel({
        filename: `Vehicle_Expenses_${new Date().toISOString().slice(0, 10)}`,
        sheetName: "Vehicle Expenses",
        title: "Vehicle Expenses",
        subtitle: `Generated ${new Date().toLocaleString()}`,
        columns: [
          { header: "Customer", key: "customer", width: 22 },
          { header: "Company", key: "company", width: 22 },
          { header: "VIN", key: "vin", width: 22 },
          { header: "Customer Charge", key: "charge", width: 16 },
          { header: "Company Cost", key: "cost", width: 16 },
          { header: "Profit", key: "profit", width: 14 },
        ],
        rows: filtered.map((row) => ({
          customer: row.customer,
          company: row.company,
          vin: row.vin,
          charge: row.charge,
          cost: row.cost,
          profit: row.profit,
        })),
        totals: [
          { label: "Vehicles", value: String(totals.count) },
          { label: "Customer Charge", value: formatCurrency(totals.charge) },
          { label: "Company Cost", value: formatCurrency(totals.cost) },
          { label: "Profit", value: formatCurrency(totals.profit) },
        ],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
          <Input
            placeholder="Filter by customer, company, or VIN…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#4B5563]">
            {totals.count} vehicles
          </span>
          <span className="rounded-md border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#4B5563]">
            Charge {formatCurrency(totals.charge)}
          </span>
          <span className="rounded-md border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#4B5563]">
            Cost {formatCurrency(totals.cost)}
          </span>
          <span className="rounded-md border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-2 py-1 text-xs font-semibold text-[#92730E]">
            Profit {formatCurrency(totals.profit)}
          </span>
          <ExportButtons onExcel={handleExportExcel} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            Reload
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={saveAll}
            disabled={savingAll || dirtyCount === 0}
          >
            <Save className="h-4 w-4" />
            {savingAll ? "Saving…" : "Save all"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#B7B7B7] bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-[#D0D0D0] bg-[#F3F3F3] px-3 py-2">
          <div className="w-16 rounded border border-[#C6C6C6] bg-white px-2 py-1 text-center font-mono text-xs text-[#374151]">
            {expanded ? "F" : "—"}
          </div>
          <div className="flex-1 rounded border border-[#C6C6C6] bg-white px-3 py-1 text-sm text-[#111827]">
            {expanded
              ? `${expanded.vin} · ${expanded.customer} · ${expanded.count} expense${expanded.count === 1 ? "" : "s"}`
              : "Click a vehicle row to expand its expenses. Customer, company, and VIN stay on the summary sheet."}
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} />
        ) : error ? (
          <ErrorState
            title="Could not load vehicle expenses"
            description={errorMessage || "Check your connection and try again."}
            onRetry={load}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={search ? "No matching vehicles" : "No vehicles yet"}
            description={
              search
                ? "Try a different customer, company, or VIN."
                : "Add vehicles in the Vehicle Data tab, then return here to record expenses."
            }
          />
        ) : (
          <div className="max-h-[70vh] overflow-auto thin-scroll">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 w-10 border border-[#C6C6C6] bg-[#E6E6E6] px-1 py-1 text-[10px] font-semibold text-[#6B7280]" />
                  {SUMMARY_COLUMNS.map((col) => (
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
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, index) => {
                  const isOpen = expandedId === row.vehicle.id;
                  return (
                    <Fragment key={row.vehicle.id}>
                      <tr
                        className={`cursor-pointer ${isOpen ? "bg-[#E8F5EE]" : index % 2 ? "bg-[#FAFAFA]" : "bg-white"} hover:bg-[#F0FDF4]`}
                        onClick={() => toggleExpand(row.vehicle.id)}
                      >
                        <td className="sticky left-0 z-10 border border-[#D0D0D0] bg-[#F3F3F3] px-1 py-0 text-center font-mono text-[11px] text-[#6B7280]">
                          <div className="flex h-8 items-center justify-center">
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 text-[#217346]" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </div>
                        </td>
                        <td className="border border-[#D0D0D0] px-2">
                          <div className="flex h-8 items-center truncate">{row.customer}</div>
                        </td>
                        <td className="border border-[#D0D0D0] px-2">
                          <div className="flex h-8 items-center truncate">{row.company}</div>
                        </td>
                        <td className="border border-[#D0D0D0] px-2">
                          <div className="flex h-8 items-center font-mono text-xs">{row.vin}</div>
                        </td>
                        <td className="border border-[#D0D0D0] px-2">
                          <div className="flex h-8 items-center justify-end font-mono">
                            {formatCurrency(row.charge)}
                          </div>
                        </td>
                        <td className="border border-[#D0D0D0] px-2">
                          <div className="flex h-8 items-center justify-end font-mono text-[#DC2626]">
                            {formatCurrency(row.cost)}
                          </div>
                        </td>
                        <td className="border border-[#D0D0D0] px-2">
                          <div className="flex h-8 items-center justify-end font-mono font-semibold text-[#92730E]">
                            {formatCurrency(row.profit)}
                            {row.dirtyCount > 0 ? " *" : ""}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="border border-[#C6C6C6] bg-[#F8FFF8] p-0">
                            <ExpenseDetailPanel
                              vehicleLabel={`${row.vehicle.make} ${row.vehicle.model}`.trim()}
                              vin={row.vin}
                              expenses={row.expenses}
                              onAdd={() => addExpense(row.vehicle.id)}
                              onChange={updateExpense}
                              onSave={saveExpense}
                              onDelete={deleteExpense}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="bg-[#E8F5EE] font-semibold">
                  <td className="sticky left-0 border border-[#C6C6C6] bg-[#E8F5EE] px-1 text-center text-[11px]">
                    Σ
                  </td>
                  <td className="border border-[#C6C6C6] px-2 py-1.5 font-mono text-xs">
                    {totals.count} vehicles
                  </td>
                  <td className="border border-[#C6C6C6]" />
                  <td className="border border-[#C6C6C6]" />
                  <td className="border border-[#C6C6C6] px-2 py-1.5 text-right font-mono text-xs">
                    {formatCurrency(totals.charge)}
                  </td>
                  <td className="border border-[#C6C6C6] px-2 py-1.5 text-right font-mono text-xs text-[#DC2626]">
                    {formatCurrency(totals.cost)}
                  </td>
                  <td className="border border-[#C6C6C6] px-2 py-1.5 text-right font-mono text-xs text-[#92730E]">
                    {formatCurrency(totals.profit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ExpenseDetailPanel({
  vehicleLabel,
  vin,
  expenses,
  onAdd,
  onChange,
  onSave,
  onDelete,
}: {
  vehicleLabel: string;
  vin: string;
  expenses: ExpenseRow[];
  onAdd: () => void;
  onChange: (id: string, field: keyof ExpenseRow, value: string | number) => void;
  onSave: (row: ExpenseRow) => Promise<boolean>;
  onDelete: (row: ExpenseRow) => Promise<void>;
}) {
  return (
    <div className="space-y-3 p-3" onClick={(event) => event.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#111827]">
            {vehicleLabel || "Vehicle"} expenses
          </p>
          <p className="text-xs text-[#6B7280] font-mono">{vin}</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add expense
        </Button>
      </div>

      {expenses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#C6C6C6] bg-white px-4 py-6 text-center text-sm text-[#6B7280]">
          No expenses on this vehicle yet. Add one to track customer charge, company cost, and profit.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#C6C6C6] bg-white">
          <table className="min-w-[920px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#217346] text-left text-[11px] font-semibold uppercase tracking-wide text-white">
                <th className="border border-[#1B5E3B] px-2 py-1.5">Title</th>
                <th className="border border-[#1B5E3B] px-2 py-1.5">Category</th>
                <th className="border border-[#1B5E3B] px-2 py-1.5">Date</th>
                <th className="border border-[#1B5E3B] px-2 py-1.5 text-right">Customer Charge</th>
                <th className="border border-[#1B5E3B] px-2 py-1.5 text-right">Company Cost</th>
                <th className="border border-[#1B5E3B] px-2 py-1.5 text-right">Profit</th>
                <th className="border border-[#1B5E3B] px-2 py-1.5">Notes</th>
                <th className="w-20 border border-[#1B5E3B] px-2 py-1.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((row) => (
                <tr key={row.id} className={row.dirty ? "bg-[#FFF8DC]" : "bg-white"}>
                  <td className="border border-[#D0D0D0] p-1">
                    <Input
                      aria-label="Expense title"
                      value={row.title}
                      onChange={(event) => onChange(row.id, "title", event.target.value)}
                      className="h-8"
                      placeholder="e.g. Ocean freight"
                    />
                  </td>
                  <td className="border border-[#D0D0D0] p-1">
                    <select
                      aria-label="Category"
                      value={row.category || ""}
                      onChange={(event) => onChange(row.id, "category", event.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Uncategorized</option>
                      {EXPENSE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap border border-[#D0D0D0] px-2 text-xs text-[#6B7280]">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="border border-[#D0D0D0] p-1">
                    <Input
                      aria-label="Customer charge"
                      type="number"
                      value={row.customerCharge || ""}
                      onChange={(event) => onChange(row.id, "customerCharge", event.target.value)}
                      className="h-8 text-right font-mono"
                    />
                  </td>
                  <td className="border border-[#D0D0D0] p-1">
                    <Input
                      aria-label="Company cost"
                      type="number"
                      value={row.companyCost || ""}
                      onChange={(event) => onChange(row.id, "companyCost", event.target.value)}
                      className="h-8 text-right font-mono"
                    />
                  </td>
                  <td className="border border-[#D0D0D0] px-2 text-right font-mono text-sm font-semibold text-[#92730E]">
                    {formatCurrency(row.profit)}
                  </td>
                  <td className="border border-[#D0D0D0] p-1">
                    <Input
                      aria-label="Notes"
                      value={row.notes || ""}
                      onChange={(event) => onChange(row.id, "notes", event.target.value)}
                      className="h-8"
                    />
                  </td>
                  <td className="border border-[#D0D0D0] px-1">
                    <div className="flex h-8 items-center justify-center gap-1">
                      {row.dirty && (
                        <button
                          type="button"
                          className="rounded p-1 text-[#217346] hover:bg-[#E8F5EE]"
                          title="Save expense"
                          disabled={row.saving}
                          onClick={() => onSave(row)}
                        >
                          <Save className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded p-1 text-[#DC2626] hover:bg-[#FEF2F2]"
                        title="Delete expense"
                        disabled={row.saving}
                        onClick={() => onDelete(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
