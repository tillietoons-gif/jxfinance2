import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const vehicle = await db.vehicle.findUnique({
      where: { id },
      include: {
        customer: true,
        expenses: { orderBy: { createdAt: "desc" }, include: { vendor: true } },
        payments: {
          orderBy: { createdAt: "desc" },
          include: { customer: true },
        },
        invoices: {
          orderBy: { createdAt: "desc" },
          include: { items: true },
        },
      },
    });
    if (!vehicle)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const companyLedger = vehicle.companyLedgerId
      ? await db.ledger.findUnique({ where: { id: vehicle.companyLedgerId } })
      : null;
    const totalCharge = vehicle.expenses.reduce(
      (s, e) => s + (e.customerCharge || 0),
      0
    );
    const totalCost = vehicle.expenses.reduce(
      (s, e) => s + (e.companyCost || 0),
      0
    );
    const profit = totalCharge - totalCost;
    const paymentsReceived = vehicle.payments.reduce(
      (s, p) => s + (p.amount || 0),
      0
    );
    const margin = totalCharge > 0 ? (profit / totalCharge) * 100 : 0;
    const billingHistory = vehicle.expenses.length
      ? await db.auditLog.findMany({
          where: {
            entity: "Expense",
            entityId: { in: vehicle.expenses.map((expense) => expense.id) },
            action: { in: ["billed", "disputed"] },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
    return NextResponse.json({
      ...vehicle,
      companyLedger,
      totalCharge,
      totalCost,
      profit,
      paymentsReceived,
      margin,
      billingHistory,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const updated = await db.vehicle.update({
      where: { id },
      data: {
        vin: body.vin,
        make: body.make,
        model: body.model,
        year: Number(body.year),
        destination: body.destination,
        status: body.status,
        notes: body.notes || null,
        customerId: body.customerId,
        companyLedgerId: body.companyLedgerId || null,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await db.vehicle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
