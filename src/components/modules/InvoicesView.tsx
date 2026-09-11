"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  FileText,
  Plus,
  Search,
  Trash2,
  Pencil,
  Eye,
  X,
  Plus as PlusIcon,
  DollarSign,
  Receipt,
  Clock,
  CheckCircle2,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  formatCurrency,
  formatDate,
  generateInvoiceNumber,
  INVOICE_STATUSES,
} from "@/lib/types";
import { exportToExcel } from "@/lib/excel";
import { generateInvoicePdf } from "@/lib/pdf";

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  tax: number;
  total: number;
  customer?: { id: string; name: string; companyName?: string };
  customerId: string;
  vehicle?: { id: string; vin: string; make: string; model: string } | null;
  vehicleId?: string | null;
  items?: any[];
  expenses?: any[];
}

export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [detailData, setDetailData] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [iRes, cRes, vRes] = await Promise.all([
        fetch("/api/invoices"),
        fetch("/api/customers"),
        fetch("/api/vehicles"),
      ]);
      if (!iRes.ok || !cRes.ok || !vRes.ok)
        throw new Error("Failed to load invoices");
      const i = await iRes.json();
      const c = await cRes.json();
      const v = await vRes.json();
      setInvoices(i);
      setCustomers(c);
      setVehicles(v);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (inv: Invoice) => {
    setDetailInvoice(inv);
    const res = await fetch(`/api/invoices/${inv.id}`);
    const d = await res.json();
    setDetailData(d);
  };

  const deleteInvoice = async (invoice: Invoice) => {
    if (!confirm(`Delete ${invoice.invoiceNumber}? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "Failed to delete invoice");
      }
      setDetailInvoice(null);
      setDetailData(null);
      toast.success("Invoice deleted");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete invoice");
    }
  };

  const filtered = invoices.filter((i) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      i.invoiceNumber.toLowerCase().includes(s) ||
      (i.customer?.name || "").toLowerCase().includes(s);
    const matchStatus = statusFilter === "all" || i.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalIssued = invoices
    .filter((i) => i.status !== "DRAFT")
    .reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices
    .filter((i) => i.status === "PAID")
    .reduce((s, i) => s + i.total, 0);
  const totalOutstanding = invoices
    .filter((i) => i.status === "ISSUED" || i.status === "PARTIALLY_PAID")
    .reduce((s, i) => s + i.total, 0);
  const overdueCount = invoices.filter((i) => i.status === "OVERDUE").length;

  const handleExcel = async () => {
    await exportToExcel({
      filename: `Invoices_${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Invoices",
      title: "Invoice Export",
      columns: [
        { header: "Invoice #", key: "invoiceNumber", width: 22 },
        { header: "Customer", key: "customerName", width: 22 },
        { header: "Status", key: "status", width: 14 },
        { header: "Issue Date", key: "issueDate", width: 14 },
        { header: "Due Date", key: "dueDate", width: 14 },
        { header: "Subtotal", key: "subtotal", width: 14 },
        { header: "Tax", key: "tax", width: 12 },
        { header: "Total", key: "total", width: 14 },
      ],
      rows: filtered.map((i) => ({
        ...i,
        customerName: i.customer?.name || "—",
        issueDate: formatDate(i.issueDate),
        dueDate: formatDate(i.dueDate),
      })),
      totals: [
        { label: "Total Issued", value: formatCurrency(totalIssued) },
        { label: "Total Paid", value: formatCurrency(totalPaid) },
        { label: "Outstanding", value: formatCurrency(totalOutstanding) },
      ],
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        subtitle="Generate vehicle-specific or custom invoices with line items"
        icon={FileText}
        actions={
          <>
            <ExportButtons onExcel={handleExcel} />
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Invoice
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCardSimple
          label="Total Issued"
          value={formatCurrency(totalIssued)}
          icon={Receipt}
        />
        <KpiCardSimple
          label="Paid"
          value={formatCurrency(totalPaid)}
          icon={CheckCircle2}
          tone="success"
        />
        <KpiCardSimple
          label="Outstanding"
          value={formatCurrency(totalOutstanding)}
          icon={Clock}
          tone="warning"
        />
        <KpiCardSimple
          label="Overdue"
          value={`${overdueCount} invoice(s)`}
          icon={Clock}
          tone="danger"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
          <Input
            placeholder="Search invoice number or customer…"
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
            {INVOICE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : error ? (
          <ErrorState onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Create your first invoice — auto-generated or with manual line items."
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
                New Invoice
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto thin-scroll">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F9FAFB] hover:bg-[#F9FAFB]">
                  <TableHead className="w-[60px]"></TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => (
                  <TableRow key={i.id} className="hover:bg-[#F9FAFB]">
                    <TableCell>
                      <div className="h-8 w-8 rounded-md bg-[#F3F4F6] flex items-center justify-center">
                        <FileText className="h-3.5 w-3.5 text-[#6B7280]" />
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-medium">
                      {i.invoiceNumber}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {i.customer?.name || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-[#6B7280]">
                      {formatDate(i.issueDate)}
                    </TableCell>
                    <TableCell className="text-xs text-[#6B7280]">
                      {formatDate(i.dueDate)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={i.status} type="invoice" />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(i.subtotal)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-[#6B7280]">
                      {formatCurrency(i.tax)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {formatCurrency(i.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => openDetail(i)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setEditing(i);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-[#DC2626]"
          onClick={() => deleteInvoice(i)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <InvoiceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        customers={customers}
        vehicles={vehicles}
        onSuccess={load}
      />

      {/* Detail sheet */}
      <Sheet
        open={!!detailInvoice}
        onOpenChange={(o) => {
          if (!o) {
            setDetailInvoice(null);
            setDetailData(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 overflow-y-auto thin-scroll"
        >
          <SheetHeader className="px-5 py-4 border-b border-[#E5E7EB] bg-white sticky top-0 z-10">
            <SheetTitle className="text-base font-mono">
              {detailInvoice?.invoiceNumber}
            </SheetTitle>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge
                status={detailInvoice?.status || "DRAFT"}
                type="invoice"
              />
              <span className="text-xs text-[#6B7280]">
                Due {formatDate(detailInvoice?.dueDate)}
              </span>
            </div>
          </SheetHeader>
          {!detailData ? (
            <div className="p-6 space-y-3">
              <div className="h-4 w-1/3 bg-[#F3F4F6] rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-[#F3F4F6] rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-[#F3F4F6] rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-[#F3F4F6] rounded animate-pulse" />
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-semibold">
                    Bill To
                  </p>
                  <p className="text-sm font-medium">
                    {detailData.customer?.name}
                  </p>
                  {detailData.customer?.companyName && (
                    <p className="text-xs text-[#6B7280]">
                      {detailData.customer.companyName}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-semibold">
                    Vehicle
                  </p>
                  <p className="text-sm font-medium">
                    {detailData.vehicle
                      ? `${detailData.vehicle.make} ${detailData.vehicle.model}`
                      : "—"}
                  </p>
                  {detailData.vehicle && (
                    <p className="text-xs text-[#6B7280] font-mono">
                      {detailData.vehicle.vin}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-[#E5E7EB] divide-y divide-[#F3F4F6]">
                <div className="grid grid-cols-12 gap-2 p-2.5 bg-[#F9FAFB] text-[10px] uppercase tracking-wider font-semibold text-[#6B7280]">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Unit</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>
                {(detailData.items || []).map((it: any) => (
                  <div
                    key={it.id}
                    className="grid grid-cols-12 gap-2 p-2.5 text-xs"
                  >
                    <div className="col-span-6">{it.description}</div>
                    <div className="col-span-2 text-center">{it.quantity}</div>
                    <div className="col-span-2 text-right font-mono">
                      {formatCurrency(it.unitPrice)}
                    </div>
                    <div className="col-span-2 text-right font-mono font-semibold">
                      {formatCurrency(it.total)}
                    </div>
                  </div>
                ))}
                {(detailData.expenses || []).map((expense: any) => (
                  <div
                    key={`expense-${expense.id}`}
                    className="grid grid-cols-12 gap-2 border-t border-[#F3F4F6] bg-[#FFFBEB] p-2.5 text-xs"
                  >
                    <div className="col-span-6">
                      <span className="font-mono text-[11px] text-[#6B7280]">
                        {expense.vehicle?.vin || "—"}
                      </span>
                      <span className="mx-1.5 text-[#D1D5DB]">—</span>
                      {expense.notes || expense.title || "Expense"}
                    </div>
                    <div className="col-span-2 text-center">1</div>
                    <div className="col-span-2 text-right font-mono">{formatCurrency(expense.customerCharge)}</div>
                    <div className="col-span-2 text-right font-mono font-semibold">{formatCurrency(expense.customerCharge)}</div>
                  </div>
                ))}
                {(!detailData.items || detailData.items.length === 0) && (!detailData.expenses || detailData.expenses.length === 0) && (
                  <div className="p-4 text-center text-sm text-[#9CA3AF]">
                    No line items
                  </div>
                )}
              </div>

              <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between text-[#4B5563]">
                  <span>Subtotal</span>
                  <span className="font-mono">
                    {formatCurrency(detailData.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-[#4B5563]">
                  <span>Tax</span>
                  <span className="font-mono">
                    {formatCurrency(detailData.tax)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#E5E7EB] pt-1.5 font-bold text-base">
                  <span>Total</span>
                  <span className="font-mono">
                    {formatCurrency(detailData.total)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="w-full gap-1.5"
                  onClick={() =>
                    generateInvoicePdf({
                      invoice: detailData,
                      customer: detailData.customer,
                      vehicle: detailData.vehicle,
                      items: detailData.items,
                      expenses: detailData.expenses,
                    })
                  }
                >
                  <FileText className="h-4 w-4" />
                  Generate Invoice PDF
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-1.5 border-[#FECACA] text-[#DC2626] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
                  onClick={() => detailInvoice && deleteInvoice(detailInvoice)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Invoice
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCardSimple({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: any;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tones: Record<string, string> = {
    default: "bg-white",
    success: "bg-[#D4AF37]/10 border-[#D4AF37]/30",
    warning: "bg-[#D4AF37]/10 border-[#D4AF37]/30",
    danger: "bg-[#DC2626]/10 border-[#DC2626]/30",
  };
  return (
    <div
      className={`rounded-xl border border-[#E5E7EB] ${tones[tone]} p-4`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-[#6B7280]">
            {label}
          </p>
          <p className="text-xl font-bold">{value}</p>
        </div>
        <div className="h-8 w-8 rounded-md bg-black/5 flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function InvoiceFormDialog({
  open,
  onOpenChange,
  editing,
  customers,
  vehicles,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Invoice | null;
  customers: any[];
  vehicles: any[];
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    invoiceNumber: generateInvoiceNumber(),
    customerId: "",
    vehicleId: "",
    vehicleIds: [] as string[],
    status: "DRAFT",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    tax: 0,
    items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
    expenseIds: [] as string[],
  });
  const [customerExpenses, setCustomerExpenses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [invoiceDefaults, setInvoiceDefaults] = useState({ prefix: "INV", taxRate: 0 });

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((settings) => {
        if (settings) setInvoiceDefaults({ prefix: settings.invoicePrefix || "INV", taxRate: Number(settings.taxRate || 0) });
      })
      .catch(() => undefined);
    if (editing) {
      setForm({
        invoiceNumber: editing.invoiceNumber,
        customerId: editing.customerId,
        vehicleId: editing.vehicleId || "",
        vehicleIds: editing.vehicleId ? [editing.vehicleId] : [],
        status: editing.status,
        issueDate: new Date(editing.issueDate).toISOString().slice(0, 10),
        dueDate: new Date(editing.dueDate).toISOString().slice(0, 10),
        tax: editing.tax,
        expenseIds: (editing.expenses || []).map((expense: any) => expense.id),
        items: (editing.items || []).map((it: any) => ({
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
        })),
      });
    } else {
      setForm({
        invoiceNumber: generateInvoiceNumber(invoiceDefaults.prefix),
        customerId: customers[0]?.id || "",
        vehicleId: "",
        vehicleIds: [],
        status: "DRAFT",
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        tax: invoiceDefaults.taxRate,
        items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
        expenseIds: [],
      });
    }
  }, [editing, customers, open, invoiceDefaults.prefix, invoiceDefaults.taxRate]);

  useEffect(() => {
    if (!open || !form.customerId) {
      setCustomerExpenses([]);
      return;
    }
    fetch(`/api/expenses?customerId=${encodeURIComponent(form.customerId)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((expenses) => {
        setCustomerExpenses(expenses);
        if (!editing) {
          setForm((current) => ({
            ...current,
            expenseIds: expenses
              .filter((expense: any) => !expense.invoiceId && Number(expense.customerCharge) > 0)
              .map((expense: any) => expense.id),
          }));
        }
      })
      .catch(() => setCustomerExpenses([]));
  }, [open, form.customerId, editing]);

  const customerVehicles = vehicles.filter(
    (v) => v.customerId === form.customerId
  );
  const availableExpenses = customerExpenses.filter(
    (expense) =>
      (!expense.invoiceId || expense.invoiceId === editing?.id) &&
      Number(expense.customerCharge) > 0 &&
      (!form.vehicleIds.length || form.vehicleIds.includes(expense.vehicleId))
  );

  const subtotal = form.items.reduce(
    (s, it) => s + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0),
    0
  ) + availableExpenses
    .filter((expense) => form.expenseIds.includes(expense.id))
    .reduce((sum, expense) => sum + (Number(expense.customerCharge) || 0), 0);
  const total = subtotal + Number(form.tax || 0);

  const updateItem = (i: number, field: string, value: any) => {
    const next = [...form.items];
    next[i] = { ...next[i], [field]: value };
    next[i].total = (Number(next[i].quantity) || 0) * (Number(next[i].unitPrice) || 0);
    setForm({ ...form, items: next });
  };

  const addItem = () =>
    setForm({
      ...form,
      items: [
        ...form.items,
        { description: "", quantity: 1, unitPrice: 0, total: 0 },
      ],
    });

  const removeItem = (i: number) =>
    setForm({
      ...form,
      items: form.items.filter((_, idx) => idx !== i),
    });

  const submit = async () => {
    if (!form.customerId) {
      toast.error("Customer is required");
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/invoices/${editing.id}` : "/api/invoices";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "Failed to save invoice");
      }
      toast.success(editing ? "Invoice updated" : "Invoice created");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto thin-scroll">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Invoice" : "New Invoice"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Invoice #</Label>
              <Input
                value={form.invoiceNumber}
                onChange={(e) =>
                  setForm({ ...form, invoiceNumber: e.target.value })
                }
                className="mt-1 font-mono"
              />
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
                  {INVOICE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Customer *</Label>
            <Select
              value={form.customerId}
              onValueChange={(v) =>
                setForm({ ...form, customerId: v, vehicleId: "", expenseIds: [] })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-[#E5E7EB] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Expenses</Label>
              <span className="text-[10px] text-[#6B7280]">Selected charges appear on the invoice</span>
            </div>
            {availableExpenses.length === 0 ? (
              <p className="text-xs text-[#9CA3AF]">No customer-charge expenses for this customer.</p>
            ) : (
              <div className="space-y-2">
                {availableExpenses.map((expense) => {
                  const selected = form.expenseIds.includes(expense.id);
                  return (
                    <label key={expense.id} className="flex items-center gap-2 rounded-md border border-[#F3F4F6] p-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) =>
                          setForm({
                            ...form,
                            expenseIds: checked
                              ? [...form.expenseIds, expense.id]
                              : form.expenseIds.filter((id) => id !== expense.id),
                          })
                        }
                      />
                      <span className="flex-1">{expense.title}</span>
                      <span className="font-mono text-xs">{formatCurrency(expense.customerCharge)}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-[#E5E7EB] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold">Vehicles</Label>
                <p className="text-[10px] text-[#6B7280]">Select multiple vehicles to combine their expenses.</p>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setForm({ ...form, vehicleIds: form.vehicleIds.length === customerVehicles.length ? [] : customerVehicles.map((v) => v.id), vehicleId: "" })}>
                {form.vehicleIds.length === customerVehicles.length ? "Clear all" : "Select all"}
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {customerVehicles.map((v) => (
                <label key={v.id} className="flex items-center gap-2 rounded-md border border-[#F3F4F6] p-2 text-sm cursor-pointer">
                  <Checkbox checked={form.vehicleIds.includes(v.id)} onCheckedChange={(checked) => {
                    const vehicleIds = checked ? [...form.vehicleIds, v.id] : form.vehicleIds.filter((id) => id !== v.id);
                    setForm({ ...form, vehicleIds, vehicleId: vehicleIds.length === 1 ? vehicleIds[0] : "", expenseIds: form.expenseIds.filter((id) => customerExpenses.find((e) => e.id === id && vehicleIds.includes(e.vehicleId))) });
                  }} />
                  <span>{v.vin} — {v.make} {v.model}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Issue Date</Label>
              <Input
                type="date"
                value={form.issueDate}
                onChange={(e) =>
                  setForm({ ...form, issueDate: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) =>
                  setForm({ ...form, dueDate: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="rounded-lg border border-[#E5E7EB] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Line Items</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1"
                onClick={addItem}
              >
                <PlusIcon className="h-3 w-3" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 items-center"
                >
                  <Input
                    placeholder="Description"
                    value={it.description}
                    onChange={(e) =>
                      updateItem(i, "description", e.target.value)
                    }
                    className="col-span-5 text-sm"
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={it.quantity || ""}
                    onChange={(e) =>
                      updateItem(i, "quantity", Number(e.target.value))
                    }
                    className="col-span-2 text-sm"
                  />
                  <Input
                    type="number"
                    placeholder="Unit $"
                    value={it.unitPrice || ""}
                    onChange={(e) =>
                      updateItem(i, "unitPrice", Number(e.target.value))
                    }
                    className="col-span-2 text-sm"
                  />
                  <div className="col-span-2 text-right text-sm font-mono font-semibold">
                    {formatCurrency(it.total)}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="col-span-1 h-8 w-8 p-0 text-[#DC2626]"
                    onClick={() => removeItem(i)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-[#4B5563]">
              <span>Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[#4B5563] items-center">
              <span>Tax</span>
              <Input
                type="number"
                value={form.tax || ""}
                onChange={(e) =>
                  setForm({ ...form, tax: Number(e.target.value) })
                }
                className="w-28 h-7 text-right text-sm font-mono"
              />
            </div>
            <div className="flex justify-between border-t border-[#E5E7EB] pt-1.5 font-bold text-base">
              <span>Total</span>
              <span className="font-mono">{formatCurrency(total)}</span>
            </div>
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
            {saving ? "Saving…" : editing ? "Update" : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
