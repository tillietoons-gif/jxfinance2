import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");
    const [vehicles, companyLedgers] = await Promise.all([
      db.vehicle.findMany({
        where: {
          ...(customerId ? { customerId } : {}),
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          customer: true,
          expenses: true,
          _count: { select: { payments: true, invoices: true } },
        },
      }),
      db.ledger.findMany({ where: { type: "COMPANY" } }),
    ]);
    const ledgerById = new Map(companyLedgers.map((ledger) => [ledger.id, ledger]));
    const enriched = vehicles.map((v) => {
      const totalCharge = v.expenses.reduce(
        (s, e) => s + (e.customerCharge || 0),
        0
      );
      const totalCost = v.expenses.reduce(
        (s, e) => s + (e.companyCost || 0),
        0
      );
      const profit = totalCharge - totalCost;
      return {
        ...v,
        totalCharge,
        totalCost,
        profit,
        companyLedger: v.companyLedgerId
          ? ledgerById.get(v.companyLedgerId) || null
          : null,
      };
    });
    return NextResponse.json(enriched);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const vehicle = await db.vehicle.create({
      data: {
        vin: body.vin,
        make: body.make,
        model: body.model,
        year: Number(body.year),
        destination: body.destination,
        status: body.status || "PENDING",
        notes: body.notes || null,
        customerId: body.customerId,
        companyLedgerId: body.companyLedgerId || null,
      },
    });
    return NextResponse.json(vehicle);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
