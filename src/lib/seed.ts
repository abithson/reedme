import type { Business, Customer, ImportRecord, Order, Transaction, TransactionMatch, Workspace } from "@/lib/types";
import { normalizePhone, roundMoney, toIsoDate } from "@/lib/utils";
import { reconcileWorkspace } from "@/lib/reconciliation";

const DEMO_CUSTOMER_NAMES = [
  "Amina Bello", "Chika Madu", "Tunde Adeyemi", "Folake Adebayo", "Emeka Okafor",
  "Zainab Yusuf", "Bola Ogunleye", "Ifeoma Nwosu", "Seyi Lawal", "Hadiza Aliyu",
  "Kunle Bakare", "Ngozi Eze", "Musa Ibrahim", "Kemi Ojo", "Obinna Umeh",
  "Mariam Sani", "Segun Akinola", "Adaeze Obi", "Yusuf Abdullahi", "Ronke Afolabi",
  "Femi Balogun", "Amaka Chukwu", "Salihu Garba", "Bisi Akinyemi", "Chinedu Nnamdi",
  "Fatima Musa", "Tola Ogundipe", "Nneka Onwudiwe", "Ibrahim Shehu", "Yetunde Ajayi",
  "Dayo Oladipo", "Uche Ezeani", "Aisha Sule", "Morenike Aina", "Oluwaseun Fashola",
  "Chisom Ibe", "Abubakar Danjuma", "Temitope Bamidele", "Efe Okoro", "Sadiya Hassan",
  "Bunmi Olatunji", "Chukwuemeka Nwankwo", "Mojisola Akande", "Abiola Balogun", "Nkiru Nwosu",
  "Salisu Lawal", "Kudirat Azeez", "Olamide Akinrinade", "Ijeoma Onyekachi", "Ahmed Tanko",
];

const PRODUCTS = [
  "rice, beans and provisions", "cooking oil and dry goods", "beverages and snacks", "cleaning supplies",
  "bulk food staples", "household essentials", "cartons of noodles and seasonings", "bakery ingredients",
  "wholesale toiletries", "packaged drinks and water",
];
const CHANNELS = ["Bank transfer", "POS settlement", "USSD transfer", "Gateway payout"];
const SUPPLIERS = ["Market restock", "Northline Foods", "Osogbo depot", "Electricity token", "Dispatch riders", "Packaging supplier", "Bank service charge", "Wholesale stock purchase"];

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toIsoDate(date);
}

function asIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function cents(value: number): number {
  return roundMoney(Math.round(value / 100) * 100);
}

export function createDemoWorkspace(): Workspace {
  const now = new Date().toISOString();
  const business: Business = {
    id: "demo-business-001",
    name: "Abeni Provisions & Distribution",
    businessType: "Wholesale & distribution",
    country: "NG",
    currency: "NGN",
    timezone: "Africa/Lagos",
    createdAt: now,
    updatedAt: now,
  };

  const customers: Customer[] = DEMO_CUSTOMER_NAMES.map((name, index) => {
    // Reserved-looking 0800 numbers are fictional demo contacts and should not receive messages.
    const phone = `+234 800 000 ${String(1001 + index).padStart(4, "0")}`;
    return {
      id: `demo-customer-${String(index + 1).padStart(2, "0")}`,
      name,
      phone,
      phoneNormalized: normalizePhone(phone),
      email: "",
      notes: index % 5 === 0 ? "Regular wholesale customer" : "",
      createdAt: now,
      updatedAt: now,
    };
  });

  const orders: Order[] = Array.from({ length: 100 }, (_, index) => {
    const customer = customers[index % customers.length];
    const orderDate = daysAgo((index * 7) % 76 + 2);
    const dueDays = index % 4 === 0 ? 7 : index % 4 === 1 ? 14 : 21;
    const amount = cents(18_500 + ((index * 37) % 840) * 375);
    const recordedPaid = index >= 80 && index % 10 === 8 ? cents(amount * 0.2) : 0;
    return {
      id: `demo-order-${String(index + 1).padStart(3, "0")}`,
      orderNumber: `AB-${String(index + 1).padStart(4, "0")}`,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      orderDate,
      dueDate: asIsoDate(orderDate, dueDays),
      amount,
      recordedPaid,
      paymentMethod: index % 3 === 0 ? "Bank transfer" : index % 3 === 1 ? "Cash / POS" : "",
      notes: `${PRODUCTS[index % PRODUCTS.length]} · ${index % 3 === 0 ? "market pickup" : "local dispatch"}`,
      duplicateFlag: false,
      createdAt: now,
      updatedAt: now,
    };
  });

  const transactions: Transaction[] = [];
  const matches: TransactionMatch[] = [];
  const bankImportId = "demo-import-bank-001";
  let txNumber = 0;

  const makeTransaction = (input: {
    date: string;
    reference: string;
    description: string;
    amount: number;
    type: "credit" | "debit";
    senderName?: string;
    senderPhone?: string;
    channel?: string;
    matchedOrderId?: string | null;
    matchStatus?: Transaction["matchStatus"];
    confidence?: number | null;
    matchReason?: string;
    duplicateFlag?: boolean;
    duplicateOf?: string | null;
    balance?: number | null;
  }): Transaction => {
    txNumber += 1;
    return {
      id: `demo-transaction-${String(txNumber).padStart(3, "0")}`,
      importId: bankImportId,
      transactionDate: `${input.date}T${String(8 + (txNumber % 10)).padStart(2, "0")}:${String((txNumber * 7) % 60).padStart(2, "0")}:00.000Z`,
      reference: input.reference,
      description: input.description,
      amount: roundMoney(input.amount),
      type: input.type,
      senderName: input.senderName ?? "",
      senderPhone: input.senderPhone ?? "",
      channel: input.channel ?? (input.type === "debit" ? "Bank transfer" : CHANNELS[txNumber % CHANNELS.length]),
      balance: input.balance ?? null,
      matchedOrderId: input.matchedOrderId ?? null,
      matchStatus: input.matchStatus ?? "unmatched",
      confidence: input.confidence ?? null,
      matchReason: input.matchReason ?? "",
      duplicateFlag: input.duplicateFlag ?? false,
      duplicateOf: input.duplicateOf ?? null,
      rawRow: {},
      createdAt: now,
      updatedAt: now,
    };
  };

  // 64 clear statement-to-order allocations, including partial payments.
  for (let index = 0; index < 80; index += 1) {
    if (index % 5 === 4) continue;
    const order = orders[index];
    const customer = customers[index % customers.length];
    const remaining = order.amount - order.recordedPaid;
    const partial = index % 4 === 1 || index % 4 === 3;
    const amount = partial ? cents(remaining * (index % 4 === 1 ? 0.55 : 0.35)) : remaining;
    const date = asIsoDate(order.orderDate, 1 + (index % 3));
    const tx = makeTransaction({
      date,
      reference: `NIP-${String(740001 + index)}`,
      description: `Transfer from ${customer.name} for order ${order.orderNumber}`,
      amount,
      type: "credit",
      senderName: customer.name,
      senderPhone: customer.phone,
      channel: CHANNELS[index % CHANNELS.length],
      matchedOrderId: order.id,
      matchStatus: "matched",
      confidence: 0.97,
      matchReason: `Seeded confirmed payment · order reference ${order.orderNumber} and customer details agree`,
    });
    transactions.push(tx);
    matches.push({
      id: `demo-match-${String(matches.length + 1).padStart(3, "0")}`,
      transactionId: tx.id,
      orderId: order.id,
      amount,
      confidence: 0.97,
      method: "automatic",
      confirmedBy: null,
      confirmedAt: now,
      createdAt: now,
    });
  }

  // Eight retained duplicate-looking pairs: neither row is silently discarded.
  for (let pair = 0; pair < 8; pair += 1) {
    const customer = customers[(pair * 5 + 7) % customers.length];
    const date = daysAgo(pair + 1);
    const amount = cents(34_500 + pair * 11_700);
    const reference = `NIP-DUP-${String(9000 + pair)}`;
    const original = makeTransaction({
      date,
      reference,
      description: `Transfer received from ${customer.name}`,
      amount,
      type: "credit",
      senderName: customer.name,
      senderPhone: customer.phone,
      channel: "Bank transfer",
    });
    transactions.push(original);
    const duplicate = makeTransaction({
      date: asIsoDate(date, 1),
      reference,
      description: `Transfer received from ${customer.name}`,
      amount,
      type: "credit",
      senderName: customer.name,
      senderPhone: customer.phone,
      channel: "Bank transfer",
      duplicateFlag: true,
      duplicateOf: original.id,
    });
    transactions.push(duplicate);
  }

  // Twelve deposits are plausible by name/date/amount but deliberately lack a unique reference.
  for (let index = 80; index < 92; index += 1) {
    const order = orders[index];
    const customer = customers[index % customers.length];
    const date = asIsoDate(order.orderDate, 2);
    transactions.push(makeTransaction({
      date,
      reference: `MOB-${String(21800 + index)}`,
      description: `Transfer received · ${customer.name}`,
      amount: Math.max(2_000, order.amount - order.recordedPaid),
      type: "credit",
      senderName: customer.name,
      senderPhone: "",
      channel: "Mobile transfer",
    }));
  }

  // Twenty-nine unallocated incoming payments with little identifying information.
  // Three explicit final-settlement mismatches and one large outlier make those rules visible too.
  for (let index = 0; index < 33; index += 1) {
    if (index < 3) {
      const order = orders[92 + index];
      const customer = customers[(92 + index) % customers.length];
      transactions.push(makeTransaction({
        date: asIsoDate(order.orderDate, 2),
        reference: `FINAL-${String(61500 + index)}`,
        description: `Final settlement for order ${order.orderNumber} from ${customer.name}`,
        amount: order.amount + 18_500 + index * 2_500,
        type: "credit",
        senderName: customer.name,
        senderPhone: customer.phone,
        channel: "Bank transfer",
      }));
      continue;
    }
    if (index === 3) {
      transactions.push(makeTransaction({
        date: daysAgo(2), reference: "TRF-LARGE-6041", description: "Credit alert · large unexplained transfer",
        amount: 6_600_000, type: "credit", senderName: "", channel: "Bank transfer",
      }));
      continue;
    }
    const date = daysAgo((index * 9) % 73 + 1);
    const amount = cents(9_500 + ((index * 97) % 380) * 1_250);
    transactions.push(makeTransaction({
      date,
      reference: `TRF-${String(53000 + index)}`,
      description: index % 4 === 0 ? "Transfer received · teller deposit" : "Credit alert · mobile banking",
      amount,
      type: "credit",
      senderName: index % 6 === 0 ? "Walk-in customer" : "",
      channel: index % 3 === 0 ? "USSD transfer" : "Bank transfer",
    }));
  }

  // 75 outgoing bank movements: stock, dispatch, bills, and bank charges are evidence too.
  for (let index = 0; index < 75; index += 1) {
    const date = daysAgo((index * 11) % 76 + 1);
    const amount = cents(2_500 + ((index * 29) % 620) * 1_150);
    const supplier = SUPPLIERS[index % SUPPLIERS.length];
    transactions.push(makeTransaction({
      date,
      reference: index % 5 === 0 ? `CHG-${String(801 + index)}` : `DB-${String(44000 + index)}`,
      description: index % 5 === 0 ? "Bank SMS alert charge" : `Debit · ${supplier}`,
      amount,
      type: "debit",
      senderName: supplier,
      channel: index % 4 === 0 ? "POS settlement" : "Bank transfer",
    }));
  }

  const imports: ImportRecord[] = [
    {
      id: "demo-import-customers-001", kind: "customers", fileName: "july-customer-list.csv", source: "csv",
      rowsSeen: 50, importedCount: 50, duplicateCount: 0, invalidCount: 0, matchedCount: 0, unmatchedCount: 0, needsReviewCount: 0, createdAt: now,
    },
    {
      id: "demo-import-orders-001", kind: "orders", fileName: "july-orders.csv", source: "csv",
      rowsSeen: 100, importedCount: 100, duplicateCount: 0, invalidCount: 0, matchedCount: 0, unmatchedCount: 0, needsReviewCount: 0, createdAt: now,
    },
    {
      id: bankImportId, kind: "transactions", fileName: "sept-bank-statement.csv", source: "csv",
      rowsSeen: 200, importedCount: 200, duplicateCount: 8, invalidCount: 0, matchedCount: matches.length, unmatchedCount: 46, needsReviewCount: 15, createdAt: now,
    },
  ];

  const initial: Workspace = { business, customers, orders, transactions, imports, matches, exceptions: [], auditLogs: [] };
  return reconcileWorkspace(initial, { autoMatch: false, now });
}
