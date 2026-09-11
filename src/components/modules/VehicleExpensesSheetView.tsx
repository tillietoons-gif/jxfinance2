"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { Car, Plus, RefreshCw, Save, Trash2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/types";
import { exportToExcel } from "@/lib/excel";

type Vehicle = { id: string; vin: string; make: string; model: string; customer?: { name: string }; customerId: string };
type Expense = { id: string; vehicleId: string; title: string; category?: string | null; vendor?: { name: string } | null; customerCharge: number; companyCost: number; profit: number; notes?: string | null; createdAt: string };
type Row = Expense & { isNew?: boolean; dirty?: boolean; saving?: boolean };

const blank = (vehicleId = ""): Row => ({ id: `new-${crypto.randomUUID()}`, vehicleId, title: "", category: "", customerCharge: 0, companyCost: 0, profit: 0, notes: "", createdAt: new Date().toISOString(), isNew: true, dirty: false });

export function VehicleExpensesSheetView() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vehiclesResponse, expensesResponse] = await Promise.all([fetch("/api/vehicles"), fetch("/api/expenses")]);
      if (!vehiclesResponse.ok || !expensesResponse.ok) throw new Error("Unable to load expenses");
      setVehicles(await vehiclesResponse.json());
      setRows(await expensesResponse.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load expenses");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const vehicleName = (id: string) => {
    const vehicle = vehicles.find((item) => item.id === id);
    return vehicle ? `${vehicle.vin} · ${vehicle.make} ${vehicle.model}` : "Select vehicle";
  };

  const update = (id: string, field: keyof Row, value: string | number) => setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value, dirty: true, ...(field === "customerCharge" || field === "companyCost" ? { profit: Number(field === "customerCharge" ? value : row.customerCharge) - Number(field === "companyCost" ? value : row.companyCost) } : {}) } : row));

  const save = async (row: Row) => {
    if (!row.vehicleId || !row.title.trim()) { toast.error("Vehicle and title are required"); return; }
    const payload = { vehicleId: row.vehicleId, title: row.title.trim(), category: row.category || "", customerCharge: Number(row.customerCharge) || 0, companyCost: Number(row.companyCost) || 0, notes: row.notes || "" };
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, saving: true } : item));
    try {
      const response = await fetch(row.isNew ? "/api/expenses" : `/api/expenses/${row.id}`, { method: row.isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.error || "Save failed"); }
      const saved = await response.json();
      setRows((current) => current.map((item) => item.id === row.id ? { ...saved, isNew: false, dirty: false, saving: false } : item));
      toast.success(row.isNew ? "Expense added" : "Expense updated");
    } catch (error) { setRows((current) => current.map((item) => item.id === row.id ? { ...item, saving: false } : item)); toast.error(error instanceof Error ? error.message : "Save failed"); }
  };

  const remove = async (row: Row) => {
    if (row.isNew) { setRows((current) => current.filter((item) => item.id !== row.id)); return; }
    if (!confirm(`Delete ${row.title}?`)) return;
    const response = await fetch(`/api/expenses/${row.id}`, { method: "DELETE" });
    if (!response.ok) { toast.error("Delete failed"); return; }
    setRows((current) => current.filter((item) => item.id !== row.id)); toast.success("Expense deleted");
  };

  const filtered = useMemo(() => { const term = search.toLowerCase().trim(); return rows.filter((row) => !term || [row.title, row.category, row.notes, vehicleName(row.vehicleId)].join(" ").toLowerCase().includes(term)); }, [rows, search, vehicles]);
  const totals = filtered.reduce((total, row) => ({ charge: total.charge + Number(row.customerCharge || 0), cost: total.cost + Number(row.companyCost || 0), profit: total.profit + Number(row.profit || 0) }), { charge: 0, cost: 0, profit: 0 });

  const exportSheet = () => exportToExcel({ filename: `Vehicle_Expenses_${new Date().toISOString().slice(0, 10)}`, sheetName: "Vehicle Expenses", title: "Vehicle Expenses", subtitle: `Generated ${new Date().toLocaleString()}`, columns: [{ header: "Vehicle", key: "vehicle" }, { header: "VIN", key: "vin" }, { header: "Date", key: "date" }, { header: "Title", key: "title" }, { header: "Category", key: "category" }, { header: "Vendor", key: "vendor" }, { header: "Customer Charge", key: "customerCharge" }, { header: "Company Cost", key: "companyCost" }, { header: "Profit", key: "profit" }, { header: "Notes", key: "notes" }], rows: filtered.map((row) => ({ ...row, vehicle: vehicleName(row.vehicleId), vin: vehicles.find((vehicle) => vehicle.id === row.vehicleId)?.vin || "", date: formatDate(row.createdAt), vendor: row.vendor?.name || "" })), totals: [{ label: "Customer Charge", value: formatCurrency(totals.charge) }, { label: "Company Cost", value: formatCurrency(totals.cost) }, { label: "Profit", value: formatCurrency(totals.profit) }] });

  return <div className="space-y-4">
    <PageHeader title="Vehicle Expenses" subtitle="Excel-style expense register linked to each vehicle" icon={Receipt} actions={<><ExportButtons onExcel={exportSheet} /><Button size="sm" variant="outline" onClick={load}><RefreshCw className="mr-1.5 h-4 w-4" />Reload</Button><Button size="sm" onClick={() => setRows((current) => [blank(vehicles[0]?.id), ...current])}><Plus className="mr-1.5 h-4 w-4" />Add expense</Button></>} />
    <div className="flex items-center gap-3"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search vehicle, title, category, notes…" className="max-w-md" /><div className="ml-auto text-xs text-muted-foreground">{filtered.length} expenses · Charge {formatCurrency(totals.charge)} · Cost {formatCurrency(totals.cost)} · Profit {formatCurrency(totals.profit)}</div></div>
    <div className="overflow-x-auto rounded-lg border bg-background shadow-sm"><table className="w-full min-w-[1180px] border-collapse text-sm"><thead><tr className="border-b bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="w-10 px-3 py-2">#</th><th className="px-3 py-2">Vehicle / VIN</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Vendor</th><th className="px-3 py-2 text-right">Customer Charge</th><th className="px-3 py-2 text-right">Company Cost</th><th className="px-3 py-2 text-right">Profit</th><th className="px-3 py-2">Notes</th><th className="w-20 px-3 py-2" /></tr></thead><tbody>{loading ? <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Loading expenses…</td></tr> : filtered.map((row, index) => <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30"><td className="px-3 py-2 text-muted-foreground">{index + 1}</td><td className="px-3 py-2"><select aria-label="Vehicle" value={row.vehicleId} onChange={(event) => update(row.id, "vehicleId", event.target.value)} className="h-9 w-52 rounded-md border bg-background px-2 text-sm"><option value="">Select vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicleName(vehicle.id)}</option>)}</select></td><td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{formatDate(row.createdAt)}</td><td className="px-3 py-2"><Input aria-label="Title" value={row.title} onChange={(event) => update(row.id, "title", event.target.value)} className="h-9 w-44" /></td><td className="px-3 py-2"><Input aria-label="Category" value={row.category || ""} onChange={(event) => update(row.id, "category", event.target.value)} className="h-9 w-32" /></td><td className="px-3 py-2 text-muted-foreground">{row.vendor?.name || "—"}</td><td className="px-3 py-2"><Input aria-label="Customer Charge" type="number" min="0" value={row.customerCharge} onChange={(event) => update(row.id, "customerCharge", Number(event.target.value))} className="h-9 w-32 text-right" /></td><td className="px-3 py-2"><Input aria-label="Company Cost" type="number" min="0" value={row.companyCost} onChange={(event) => update(row.id, "companyCost", Number(event.target.value))} className="h-9 w-32 text-right" /></td><td className="px-3 py-2 text-right font-medium text-[#92730E]">{formatCurrency(row.profit)}</td><td className="px-3 py-2"><Input aria-label="Notes" value={row.notes || ""} onChange={(event) => update(row.id, "notes", event.target.value)} className="h-9 w-44" /></td><td className="px-3 py-2"><div className="flex gap-1"><Button aria-label="Save expense" size="icon" variant="ghost" disabled={!row.dirty && !row.isNew || row.saving} onClick={() => save(row)}><Save className="h-4 w-4" /></Button><Button aria-label="Delete expense" size="icon" variant="ghost" className="text-destructive" onClick={() => remove(row)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>
  </div>;
}
