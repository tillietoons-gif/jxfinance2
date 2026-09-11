"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Car,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronRight,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Package,
  FileText,
  CreditCard,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  formatCurrency,
  formatDate,
  VEHICLE_STATUSES,
  PAYMENT_METHODS,
} from "@/lib/types";
import { exportToExcel } from "@/lib/excel";
import { generateVehicleStatementPdf } from "@/lib/pdf";
import { VehicleDetailExpenses } from "./VehicleDetailExpenses";

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
  expenses: any[];
  totalCharge: number;
  totalCost: number;
  profit: number;
  _count?: { payments: number; invoices: number };
  createdAt: string;
}

interface Customer {
  id: string;
  name: string;
}

interface CompanyLedger {
  id: string;
  name: string;
  type: string;
}

export function VehiclesView() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companyLedgers, setCompanyLedgers] = useState<CompanyLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [vRes, cRes, lRes] = await Promise.all([
        fetch("/api/vehicles"),
        fetch("/api/customers"),
        fetch("/api/ledgers?type=COMPANY"),
      ]);
      if (!vRes.ok || !cRes.ok || !lRes.ok) throw new Error("Failed to load vehicles");
      const v = await vRes.json();
      const c = await cRes.json();
      const l = await lRes.json();
      setVehicles(v);
      setCustomers(c);
      setCompanyLedgers(Array.isArray(l) ? l.filter((ledger) => ledger.type === "COMPANY") : []);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (v: Vehicle) => {
    setDetailVehicle(v);
    setDetailLoading(true);
    const res = await fetch(`/api/vehicles/${v.id}`);
    const d = await res.json();
    setDetailData(d);
    setDetailLoading(false);
  };

  const refreshDetail = async () => {
    if (!detailVehicle) return;
    const res = await fetch(`/api/vehicles/${detailVehicle.id}`);
    const d = await res.json();
    setDetailData(d);
    await load();
  };

  const filtered = vehicles.filter((v) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      v.vin.toLowerCase().includes(s) ||
      `${v.make} ${v.model}`.toLowerCase().includes(s) ||
      v.destination.toLowerCase().includes(s) ||
      v.customer?.name.toLowerCase().includes(s) ||
      (v.companyLedger?.name || "").toLowerCase().includes(s);
    const matchStatus = statusFilter === "all" || v.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalProfit = filtered.reduce((s, v) => s + v.profit, 0);
  const totalCharge = filtered.reduce((s, v) => s + v.totalCharge, 0);
  const totalCost = filtered.reduce((s, v) => s + v.totalCost, 0);

  const handleExportExcel = async () => {
    await exportToExcel({
      filename: `Vehicles_${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Vehicles",
      title: "Vehicle Fleet Export",
      subtitle: `Generated ${new Date().toLocaleString()}`,
      columns: [
        { header: "VIN", key: "vin", width: 22 },
        { header: "Make", key: "make", width: 14 },
        { header: "Model", key: "model", width: 18 },
        { header: "Year", key: "year", width: 8 },
        { header: "Customer", key: "customerName", width: 22 },
        { header: "Company", key: "companyName", width: 22 },
        { header: "Destination", key: "destination", width: 20 },
        { header: "Status", key: "status", width: 14 },
        { header: "Customer Charge", key: "totalCharge", width: 16 },
        { header: "Company Cost", key: "totalCost", width: 16 },
        { header: "Profit", key: "profit", width: 14 },
        { header: "Created", key: "createdAt", width: 14 },
      ],
      rows: filtered.map((v) => ({
        ...v,
        customerName: v.customer?.name || "",
        companyName: v.companyLedger?.name || "",
        createdAt: formatDate(v.createdAt),
      })),
      totals: [
        { label: "Total Charge", value: formatCurrency(totalCharge) },
        { label: "Total Cost", value: formatCurrency(totalCost) },
        { label: "Total Profit", value: formatCurrency(totalProfit) },
      ],
    });
  };

  const handleExportPdf = () => {
    if (!detailData) {
      toast.info("Open a vehicle to export its statement as PDF");
      return;
    }
    generateVehicleStatementPdf(detailData);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Vehicles"
        subtitle="Track vehicle shipments, expenses, and profit per unit"
        icon={Car}
        actions={
          <>
            <ExportButtons
              onExcel={handleExportExcel}
              onPdf={detailData ? handleExportPdf : undefined}
              pdfLabel="Statement PDF"
            />
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Vehicle
            </Button>
          </>
        }
      />

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total Vehicles"
          value={vehicles.length}
          icon={Package}
        />
        <KpiCard
          label="Total Charges"
          value={formatCurrency(totalCharge)}
          icon={DollarSign}
          variant="success"
        />
        <KpiCard
          label="Total Costs"
          value={formatCurrency(totalCost)}
          icon={TrendingDown}
          variant="danger"
        />
        <KpiCard
          label="Net Profit"
          value={formatCurrency(totalProfit)}
          icon={TrendingUp}
          variant="primary"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
          <Input
            placeholder="Search VIN, make, model, customer, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {VEHICLE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : error ? (
          <ErrorState onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Car}
            title="No vehicles yet"
            description="Add your first vehicle shipment to start tracking expenses and profit margins."
            action={
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add Vehicle
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto thin-scroll">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F9FAFB] hover:bg-[#F9FAFB]">
                  <TableHead className="w-[60px]"></TableHead>
                  <TableHead>VIN / Vehicle</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Charge</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="w-[110px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow
                    key={v.id}
                    className="cursor-pointer hover:bg-[#F9FAFB]"
                    onClick={() => openDetail(v)}
                  >
                    <TableCell>
                      <div className="h-8 w-8 rounded-md bg-[#F3F4F6] flex items-center justify-center">
                        <Car className="h-3.5 w-3.5 text-[#6B7280]" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">
                        {v.make} {v.model}{" "}
                        <span className="text-[#9CA3AF]">({v.year})</span>
                      </div>
                      <div className="text-xs text-[#6B7280] font-mono">
                        {v.vin}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-[#4B5563]">
                      {v.customer?.name || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-[#4B5563]">
                      {v.companyLedger?.name || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-[#4B5563]">
                      {v.destination || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={v.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(v.totalCharge)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-[#DC2626]">
                      {formatCurrency(v.totalCost)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-[#92730E]">
                      {formatCurrency(v.profit)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(v);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-[#DC2626]"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Delete vehicle ${v.vin}? Related expenses will also be removed.`)) return;
                            await fetch(`/api/vehicles/${v.id}`, { method: "DELETE" });
                            toast.success("Vehicle deleted");
                            load();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <ChevronRight className="h-4 w-4 text-[#9CA3AF]" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <VehicleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        customers={customers}
        companyLedgers={companyLedgers}
        onSuccess={load}
      />

      {/* Detail Sheet */}
      <Sheet
        open={!!detailVehicle}
        onOpenChange={(o) => {
          if (!o) {
            setDetailVehicle(null);
            setDetailData(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-3xl p-0 overflow-y-auto thin-scroll"
        >
          <SheetHeader className="px-5 py-4 border-b border-[#E5E7EB] bg-white sticky top-0 z-10">
            <SheetTitle className="text-base">
              {detailVehicle
                ? `${detailVehicle.make} ${detailVehicle.model} (${detailVehicle.year})`
                : ""}
            </SheetTitle>
            <p className="text-xs text-[#6B7280] font-mono">
              {detailVehicle?.vin}
              {detailData?.customer?.name ? ` • ${detailData.customer.name}` : ""}
              {detailData?.companyLedger?.name ? ` • ${detailData.companyLedger.name}` : ""}
            </p>
          </SheetHeader>

          {detailLoading || !detailData ? (
            <div className="p-6 space-y-3">
              <div className="h-4 w-1/3 bg-[#F3F4F6] rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-[#F3F4F6] rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-[#F3F4F6] rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-[#F3F4F6] rounded animate-pulse" />
            </div>
          ) : (
            <div className="px-5 py-4 space-y-4">
              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[#E5E7EB] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-semibold">
                    Customer Charge
                  </p>
                  <p className="text-lg font-bold text-black">
                    {formatCurrency(detailData.totalCharge)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-semibold">
                    Company Cost
                  </p>
                  <p className="text-lg font-bold text-[#991B1B]">
                    {formatCurrency(detailData.totalCost)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#92730E] font-semibold">
                    Net Profit
                  </p>
                  <p className="text-lg font-bold text-[#92730E]">
                    {formatCurrency(detailData.profit)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-semibold">
                    Margin / Payments
                  </p>
                  <p className="text-lg font-bold text-black">
                    {(detailData.margin || 0).toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-[#6B7280]">
                    {formatCurrency(detailData.paymentsReceived)} received
                  </p>
                </div>
              </div>

              {/* Action toolbar */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => generateVehicleStatementPdf(detailData)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Statement PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setEditing(detailData);
                    setDetailVehicle(null);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Vehicle
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[#DC2626] hover:text-[#991B1B]"
                  onClick={async () => {
                    if (
                      !confirm(
                        `Delete vehicle ${detailData.vin}? This will also delete related expenses.`
                      )
                    )
                      return;
                    await fetch(`/api/vehicles/${detailData.id}`, {
                      method: "DELETE",
                    });
                    toast.success("Vehicle deleted");
                    setDetailVehicle(null);
                    setDetailData(null);
                    load();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="expenses">
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="expenses">Expenses</TabsTrigger>
                  <TabsTrigger value="billing">Billing</TabsTrigger>
                  <TabsTrigger value="payments">Payments</TabsTrigger>
                  <TabsTrigger value="invoices">Invoices</TabsTrigger>
                  <TabsTrigger value="profit">Profit</TabsTrigger>
                </TabsList>

                <TabsContent value="expenses" className="mt-3">
                  <VehicleDetailExpenses
                    vehicle={detailData}
                    onChanged={refreshDetail}
                  />
                </TabsContent>

                <TabsContent value="billing" className="mt-3">
                  <VehicleBillingTab vehicle={detailData} onChanged={refreshDetail} />
                </TabsContent>

                <TabsContent value="payments" className="mt-3">
                  <VehiclePaymentsTab
                    vehicle={detailData}
                    onChanged={refreshDetail}
                  />
                </TabsContent>

                <TabsContent value="invoices" className="mt-3">
                  <VehicleInvoicesTab vehicle={detailData} />
                </TabsContent>

                <TabsContent value="profit" className="mt-3">
                  <VehicleProfitTab vehicle={detailData} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// --- Vehicle Form Dialog ---
function VehicleFormDialog({
  open,
  onOpenChange,
  editing,
  customers,
  companyLedgers,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Vehicle | null;
  customers: Customer[];
  companyLedgers: CompanyLedger[];
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    vin: "",
    make: "",
    model: "",
    year: new Date().getFullYear(),
    destination: "",
    status: "PENDING",
    notes: "",
    customerId: "",
    companyLedgerId: "",
  });
  const [saving, setSaving] = useState(false);
  const [decoding, setDecoding] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        vin: editing.vin,
        make: editing.make,
        model: editing.model,
        year: editing.year,
        destination: editing.destination,
        status: editing.status,
        notes: editing.notes || "",
        customerId: editing.customerId,
        companyLedgerId: (editing as Vehicle & { companyLedgerId?: string }).companyLedgerId || "",
      });
    } else {
      setForm({
        vin: "",
        make: "",
        model: "",
        year: new Date().getFullYear(),
        destination: "",
        status: "PENDING",
        notes: "",
        customerId: customers[0]?.id || "",
        companyLedgerId: companyLedgers[0]?.id || "",
      });
    }
  }, [editing, customers, companyLedgers, open]);

  const decodeVin = async () => {
    const vin = form.vin.trim().toUpperCase();
    if (vin.length !== 17) {
      toast.error("Enter a valid 17-character VIN");
      return;
    }

    setDecoding(true);
    try {
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`
      );
      if (!res.ok) throw new Error("VIN decode request failed");

      const data = await res.json();
      const result = data?.Results?.[0];
      if (!result) throw new Error("No vehicle data found for this VIN");

      const make = result.Make?.trim();
      const model = result.Model?.trim();
      const year = Number(result.ModelYear);
      const hasYear = Number.isInteger(year) && year > 0;
      if (!make && !model && !hasYear) {
        throw new Error("No vehicle data found for this VIN");
      }

      setForm((current) => ({
        ...current,
        vin,
        ...(make ? { make } : {}),
        ...(model ? { model } : {}),
        ...(hasYear ? { year } : {}),
      }));
      toast.success("Vehicle details decoded");
    } catch (e: any) {
      toast.error(e?.message || "Unable to decode VIN");
    } finally {
      setDecoding(false);
    }
  };

  const submit = async () => {
    if (!form.vin || !form.make || !form.model || !form.customerId || !form.companyLedgerId) {
      toast.error("VIN, Make, Model, Customer, and Company Ledger are required");
      return;
    }
    setSaving(true);
    try {
      const url = editing
        ? `/api/vehicles/${editing.id}`
        : "/api/vehicles";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save vehicle");
      toast.success(editing ? "Vehicle updated" : "Vehicle added");
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Vehicle" : "Add New Vehicle"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <Label className="text-xs">VIN *</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={form.vin}
                onChange={(e) => setForm({ ...form, vin: e.target.value })}
                placeholder="1HGCM82633A001234"
                className="font-mono"
                maxLength={17}
              />
              <Button
                type="button"
                variant="outline"
                onClick={decodeVin}
                disabled={decoding || saving}
              >
                {decoding ? "Decoding…" : "Decode"}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Make *</Label>
            <Input
              value={form.make}
              onChange={(e) => setForm({ ...form, make: e.target.value })}
              placeholder="Toyota"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Model *</Label>
            <Input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="Camry"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Year</Label>
            <Input
              type="number"
              value={form.year}
              onChange={(e) =>
                setForm({ ...form, year: Number(e.target.value) })
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Destination</Label>
            <Input
              value={form.destination}
              onChange={(e) =>
                setForm({ ...form, destination: e.target.value })
              }
              placeholder="Lagos, Nigeria"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Customer *</Label>
            <select
              aria-label="Customer"
              value={form.customerId}
              onChange={(event) => setForm({ ...form, customerId: event.target.value })}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              required
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Company Ledger *</Label>
            <select
              aria-label="Company Ledger"
              value={form.companyLedgerId}
              onChange={(event) => setForm({ ...form, companyLedgerId: event.target.value })}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              required
            >
              <option value="">Select company ledger</option>
              {companyLedgers.map((ledger) => (
                <option key={ledger.id} value={ledger.id}>{ledger.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any shipment notes…"
              className="mt-1"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Update" : "Add Vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VehicleBillingTab({
  vehicle,
  onChanged,
}: {
  vehicle: any;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const invoices = vehicle.invoices || [];
  const expenses = vehicle.expenses || [];
  const unbilledExpenses = expenses.filter(
    (expense: any) => !expense.invoiceId && Number(expense.customerCharge) > 0
  );

  const createDraftInvoice = async () => {
    if (unbilledExpenses.length === 0) {
      toast.info("No unbilled customer charges for this vehicle");
      return;
    }
    setCreatingInvoice(true);
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: vehicle.customerId,
          vehicleId: vehicle.id,
          status: "DRAFT",
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          items: [],
          expenseIds: unbilledExpenses.map((expense: any) => expense.id),
        }),
      });
      if (!response.ok) throw new Error("Failed to create invoice");
      toast.success("Draft invoice created from vehicle charges");
      onChanged();
    } catch (error: any) {
      toast.error(error.message || "Failed to create invoice");
    } finally {
      setCreatingInvoice(false);
    }
  };

  const updateBilling = async (expenseId: string, invoiceId: string) => {
    setBusyId(expenseId);
    try {
      const response = await fetch(`/api/expenses/${expenseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoiceId || null }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to update billing");
      }
      toast.success(invoiceId ? "Expense added to invoice" : "Expense disputed and removed from invoice");
      onChanged();
    } catch (error: any) {
      toast.error(error.message || "Failed to update billing");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Vehicle billing</p>
            <p className="mt-1 text-xs text-[#6B7280]">
          Add customer-charge expenses to an invoice or dispute them to remove the billing assignment.
            </p>
          </div>
          <Button size="sm" onClick={createDraftInvoice} disabled={creatingInvoice}>
            {creatingInvoice ? "Creating…" : "Create draft invoice"}
          </Button>
        </div>
      </div>
      {expenses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-[#6B7280]">
          No expenses recorded for this vehicle.
        </div>
      ) : (
        <div className="rounded-md border border-[#E5E7EB] divide-y divide-[#F3F4F6]">
          {expenses.map((expense: any) => (
            <div key={expense.id} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{expense.title}</p>
                  <p className="text-xs text-[#6B7280]">
                    {expense.category || "Uncategorized"} • {formatDate(expense.createdAt)}
                  </p>
                </div>
                <p className="font-mono text-sm font-semibold text-[#92730E]">
                  {formatCurrency(expense.customerCharge)}
                </p>
              </div>
              <Select
                value={expense.invoiceId || "unbilled"}
                onValueChange={(value) => updateBilling(expense.id, value === "unbilled" ? "" : value)}
                disabled={busyId === expense.id}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unbilled">Unbilled / disputed</SelectItem>
                  {invoices.map((invoice: any) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} • {invoice.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
      {(vehicle.billingHistory || []).length > 0 && (
        <div className="rounded-md border border-[#E5E7EB] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
            Billing history
          </p>
          <div className="space-y-2">
            {vehicle.billingHistory.map((event: any) => (
              <div key={event.id} className="flex justify-between gap-3 text-xs">
                <span className={event.action === "disputed" ? "text-red-700" : "text-[#374151]"}>
                  {event.action === "disputed" ? "Expense disputed" : "Expense billed"}
                  {event.details ? ` • ${event.details}` : ""}
                </span>
                <span className="shrink-0 text-[#6B7280]">{formatDate(event.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Payments Tab ---
function VehiclePaymentsTab({
  vehicle,
  onChanged,
}: {
  vehicle: any;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    amount: 0,
    method: PAYMENT_METHODS[0] as string,
    referenceNo: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.amount || form.amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          customerId: vehicle.customerId,
          vehicleId: vehicle.id,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Payment recorded");
      setForm({
        amount: 0,
        method: PAYMENT_METHODS[0] as string,
        referenceNo: "",
        notes: "",
      });
      setShowForm(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-[#6B7280]">
          {vehicle.payments?.length || 0} payment(s) •{" "}
          {formatCurrency(vehicle.paymentsReceived)} received
        </p>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setShowForm((s) => !s)}
        >
          <Plus className="h-3.5 w-3.5" />
          Record Payment
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-[#E5E7EB] p-3 space-y-2 bg-[#F9FAFB]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                value={form.amount || ""}
                onChange={(e) =>
                  setForm({ ...form, amount: Number(e.target.value) })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select
                value={form.method}
                onValueChange={(v) => setForm({ ...form, method: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Reference No.</Label>
            <Input
              value={form.referenceNo}
              onChange={(e) =>
                setForm({ ...form, referenceNo: e.target.value })
              }
              className="mt-1"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border border-[#E5E7EB] divide-y divide-[#F3F4F6]">
        {(vehicle.payments || []).map((p: any) => (
          <div
            key={p.id}
            className="flex items-center justify-between p-2.5 hover:bg-[#F9FAFB]"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-md bg-[#D4AF37]/15 flex items-center justify-center">
                <CreditCard className="h-3.5 w-3.5 text-[#92730E]" />
              </div>
              <div>
                <p className="text-sm font-medium">{p.method}</p>
                <p className="text-xs text-[#6B7280]">
                  {formatDate(p.createdAt)}
                  {p.referenceNo ? ` • Ref: ${p.referenceNo}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#92730E]">
                {formatCurrency(p.amount)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-[#DC2626]"
                onClick={async () => {
                  if (!confirm("Delete payment?")) return;
                  await fetch(`/api/payments/${p.id}`, { method: "DELETE" });
                  toast.success("Payment deleted");
                  onChanged();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {(vehicle.payments || []).length === 0 && (
          <div className="p-6 text-center text-sm text-[#9CA3AF]">
            No payments recorded
          </div>
        )}
      </div>
    </div>
  );
}

// --- Invoices Tab ---
function VehicleInvoicesTab({ vehicle }: { vehicle: any }) {
  if (!vehicle.invoices || vehicle.invoices.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-[#9CA3AF]">
        No invoices for this vehicle
      </div>
    );
  }
  return (
    <div className="rounded-md border border-[#E5E7EB] divide-y divide-[#F3F4F6]">
      {vehicle.invoices.map((inv: any) => (
        <div
          key={inv.id}
          className="flex items-center justify-between p-2.5 hover:bg-[#F9FAFB]"
        >
          <div>
            <p className="text-sm font-medium font-mono">{inv.invoiceNumber}</p>
            <p className="text-xs text-[#6B7280]">
              Issued {formatDate(inv.issueDate)} • Due {formatDate(inv.dueDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{inv.status}</Badge>
            <span className="text-sm font-semibold">
              {formatCurrency(inv.total)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Profit Tab ---
function VehicleProfitTab({ vehicle }: { vehicle: any }) {
  const rows = vehicle.expenses || [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-[#92730E] font-semibold">
            Profit
          </p>
          <p className="text-base font-bold text-[#92730E]">
            {formatCurrency(vehicle.profit)}
          </p>
        </div>
        <div className="rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] p-3">
          <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-semibold">
            Margin
          </p>
          <p className="text-base font-bold text-black">
            {(vehicle.margin || 0).toFixed(2)}%
          </p>
        </div>
        <div className="rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-[#92730E] font-semibold">
            Outstanding
          </p>
          <p className="text-base font-bold text-[#92730E]">
            {formatCurrency(
              Math.max(vehicle.totalCharge - vehicle.paymentsReceived, 0)
            )}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-[#E5E7EB] divide-y divide-[#F3F4F6]">
        {rows.map((e: any) => (
          <div key={e.id} className="flex items-center justify-between p-2.5">
            <div className="text-sm">{e.title}</div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="text-[#92730E]">+{formatCurrency(e.customerCharge)}</span>
              <span className="text-[#DC2626]">−{formatCurrency(e.companyCost)}</span>
              <span className="font-semibold text-black">
                {formatCurrency(e.profit)}
              </span>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="p-6 text-center text-sm text-[#9CA3AF]">
            No expenses recorded
          </div>
        )}
      </div>
    </div>
  );
}
