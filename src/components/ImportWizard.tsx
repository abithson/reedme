"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { AlertCircle, ArrowRight, Check, FileSpreadsheet, LockKeyhole, Upload } from "lucide-react";
import { useMoneyTrail } from "@/components/MoneyTrailProvider";
import { Button, Modal } from "@/components/ui";
import {
  IMPORT_FIELDS, csvOrderToOrder, inferColumnMapping, missingRequiredMappings, parseCsvText, sameCustomerIdentity, validateCsvRows,
  type ColumnMapping, type CsvRow, type CustomerCsvRow, type OrderCsvRow, type TransactionCsvRow,
} from "@/lib/csv";
import { addDaysIso, businessDate, formatBusinessMoney, normalizePhone, normalizeReference, normalizeText, createId, downloadCsv } from "@/lib/utils";
import { reconcileWorkspace } from "@/lib/reconciliation";
import type { Customer, ImportKind, ImportRecord, Transaction, Workspace } from "@/lib/types";

function nearDuplicateTransaction(row: TransactionCsvRow, candidate: Transaction): boolean {
  if (candidate.type !== row.type || Math.abs(candidate.amount - row.amount) > 1) return false;
  const dayDifference = Math.abs(new Date(`${candidate.transactionDate.slice(0, 10)}T12:00:00`).getTime() - new Date(`${row.transactionDate.slice(0, 10)}T12:00:00`).getTime()) / 86_400_000;
  if (dayDifference > 3) return false;
  const reference = normalizeReference(row.reference);
  if (reference && normalizeReference(candidate.reference) === reference) return true;
  return Boolean(row.senderName && normalizeText(candidate.senderName) === normalizeText(row.senderName) && normalizeText(candidate.description) === normalizeText(row.description));
}

function duplicateTargets(rows: CsvRow[], workspace: Workspace): Map<number, { existingId?: string; previousLine?: number }> {
  const targets = new Map<number, { existingId?: string; previousLine?: number }>();
  const earlier: CsvRow[] = [];
  for (const row of rows) {
    if (row.kind === "customers") {
      const existing = workspace.customers.find((customer) => sameCustomerIdentity(row, customer));
      const previous = earlier.find((other): other is CustomerCsvRow => other.kind === "customers" && (
        row.phoneNormalized ? other.phoneNormalized === row.phoneNormalized : normalizeText(other.name) === normalizeText(row.name)
      ));
      if (existing) targets.set(row.line, { existingId: existing.id });
      else if (previous) targets.set(row.line, { previousLine: previous.line });
    } else if (row.kind === "orders") {
      const normalized = normalizeReference(row.orderNumber);
      const existing = workspace.orders.find((order) => normalizeReference(order.orderNumber) === normalized);
      const previous = earlier.find((other): other is OrderCsvRow => other.kind === "orders" && normalizeReference(other.orderNumber) === normalized);
      if (existing) targets.set(row.line, { existingId: existing.id });
      else if (previous) targets.set(row.line, { previousLine: previous.line });
    } else {
      const existing = workspace.transactions.find((transaction) => nearDuplicateTransaction(row, transaction));
      const previous = earlier.find((other): other is TransactionCsvRow => other.kind === "transactions" && (
        other.type === row.type && Math.abs(other.amount - row.amount) <= 1 &&
        Math.abs(new Date(`${other.transactionDate.slice(0, 10)}T12:00:00`).getTime() - new Date(`${row.transactionDate.slice(0, 10)}T12:00:00`).getTime()) <= 3 * 86_400_000 &&
        (normalizeReference(row.reference) ? normalizeReference(other.reference) === normalizeReference(row.reference) : Boolean(row.senderName && normalizeText(other.senderName) === normalizeText(row.senderName) && normalizeText(other.description) === normalizeText(row.description)))
      ));
      if (existing) targets.set(row.line, { existingId: existing.id });
      else if (previous) targets.set(row.line, { previousLine: previous.line });
    }
    earlier.push(row);
  }
  return targets;
}

function createCustomer(row: CustomerCsvRow, id: string, now: string): Customer {
  return { id, name: row.name, phone: row.phone, phoneNormalized: row.phoneNormalized, email: row.email, notes: row.notes, createdAt: now, updatedAt: now };
}

function makeTransaction(row: TransactionCsvRow, id: string, importId: string, now: string, duplicateOf: string | null): Transaction {
  return {
    id, importId, transactionDate: row.transactionDate, reference: row.reference, description: row.description, amount: row.amount, type: row.type,
    senderName: row.senderName, senderPhone: row.senderPhone, channel: row.channel, balance: row.balance, matchedOrderId: null,
    matchStatus: "unmatched", confidence: null, matchReason: "", duplicateFlag: Boolean(duplicateOf), duplicateOf, rawRow: {},
    createdAt: now, updatedAt: now,
  };
}

function recordAudit(workspace: Workspace, action: string, entityType: string, entityId: string, details: Record<string, string | number | boolean | null>, now: string): Workspace["auditLogs"][number] {
  return { id: createId("audit"), actorUserId: null, action, entityType, entityId, details, createdAt: now };
}

export default function ImportWizard({ kind, onClose }: { kind: ImportKind; onClose: () => void }) {
  const { workspace, commit, mode } = useMoneyTrail();
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parseCsvText> | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [summary, setSummary] = useState<{ accepted: number; duplicates: number; invalid: number; matched: number; review: number; unmatched: number; customersCreated: number } | null>(null);

  const validation = useMemo(() => parsed ? validateCsvRows(kind, parsed.rows, mapping, workspace.business.country, workspace.business.timezone) : { valid: [], invalid: [] }, [parsed, kind, mapping, workspace.business.country, workspace.business.timezone]);
  const requiredMissing = useMemo(() => missingRequiredMappings(kind, mapping), [kind, mapping]);
  const duplicates = useMemo(() => duplicateTargets(validation.valid, workspace), [validation.valid, workspace]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError(""); setParseErrors([]); setParsed(null); setSummary(null); setComplete(false);
    if (file.size > 10 * 1024 * 1024) { setFileError("Choose a CSV smaller than 10 MB. This preview is kept in browser memory only."); return; }
    setBusy(true);
    try {
      const content = await file.text();
      const result = parseCsvText(content);
      if (result.headers.length < 2 || !result.rows.length) { setFileError("This file looks empty or is missing a header row. Export a CSV with a column-name row and try again."); setBusy(false); return; }
      const suggested = inferColumnMapping(kind, result.headers);
      setFileName(file.name);
      setParsed(result);
      setMapping(suggested);
      setParseErrors(result.errors);
    } catch {
      setFileError("We could not read this file. Choose a valid CSV and try again.");
    } finally {
      setBusy(false);
    }
  }

  function updateMapping(field: string, column: string) {
    setMapping((current) => ({ ...current, [field]: column || undefined }));
  }

  function importRows() {
    if (requiredMissing.length || !validation.valid.length) return;
    setBusy(true);
    const now = new Date().toISOString();
    const importId = createId("import");
    const dupeCount = duplicates.size;
    let matched = 0;
    let review = 0;
    let unmatched = 0;
    let customersCreated = 0;
    let importedWorkspace: Workspace = { ...workspace, customers: [...workspace.customers], orders: [...workspace.orders], transactions: [...workspace.transactions], imports: [...workspace.imports], auditLogs: [...workspace.auditLogs] };
    const resolvedCustomerByLine = new Map<number, string>();
    const createdIdByLine = new Map<number, string>();

    if (kind === "customers") {
      for (const row of validation.valid as CustomerCsvRow[]) {
        const target = duplicates.get(row.line);
        let customer = target?.existingId ? importedWorkspace.customers.find((candidate) => candidate.id === target.existingId) : null;
        if (!customer && target?.previousLine) {
          const previousId = resolvedCustomerByLine.get(target.previousLine);
          customer = importedWorkspace.customers.find((candidate) => candidate.id === previousId) ?? null;
        }
        if (customer) {
          customersCreated += 0;
          importedWorkspace.customers = importedWorkspace.customers.map((candidate) => candidate.id === customer!.id ? {
            ...candidate,
            name: row.name || candidate.name,
            phone: row.phone || candidate.phone,
            phoneNormalized: row.phoneNormalized || candidate.phoneNormalized,
            email: row.email || candidate.email,
            notes: row.notes || candidate.notes,
            updatedAt: now,
          } : candidate);
          resolvedCustomerByLine.set(row.line, customer.id);
          continue;
        }
        const id = createId("customer");
        const created = createCustomer(row, id, now);
        importedWorkspace.customers.push(created);
        resolvedCustomerByLine.set(row.line, id);
        createdIdByLine.set(row.line, id);
        customersCreated += 1;
      }
    }

    if (kind === "orders") {
      for (const row of validation.valid as OrderCsvRow[]) {
        let customer = row.customerPhone
          ? importedWorkspace.customers.find((candidate) => candidate.phoneNormalized === normalizePhone(row.customerPhone))
          : undefined;
        customer ??= importedWorkspace.customers.find((candidate) => normalizeText(candidate.name) === normalizeText(row.customerName));
        if (!customer) {
          customer = {
            id: createId("customer"), name: row.customerName, phone: row.customerPhone, phoneNormalized: normalizePhone(row.customerPhone), email: "", notes: "",
            createdAt: now, updatedAt: now,
          };
          importedWorkspace.customers.push(customer);
          customersCreated += 1;
        }
        const duplicate = duplicates.has(row.line);
        const orderId = createId("order");
        const order = csvOrderToOrder(row, orderId, customer, now, duplicate);
        importedWorkspace.orders.push(order);
        createdIdByLine.set(row.line, orderId);
      }
    }

    if (kind === "transactions") {
      for (const row of validation.valid as TransactionCsvRow[]) {
        const target = duplicates.get(row.line);
        const previousId = target?.previousLine ? createdIdByLine.get(target.previousLine) : undefined;
        const duplicateOf = target?.existingId ?? previousId ?? null;
        const transaction = makeTransaction(row, createId("transaction"), importId, now, duplicateOf);
        importedWorkspace.transactions.push(transaction);
        createdIdByLine.set(row.line, transaction.id);
      }
    }

    const totalInvalid = validation.invalid.length + (parsed?.errors.length ?? 0);
    const importRecord: ImportRecord = {
      id: importId, kind, fileName: fileName || "uploaded.csv", source: "csv", rowsSeen: parsed?.rows.length ?? validation.valid.length + validation.invalid.length,
      importedCount: validation.valid.length, duplicateCount: dupeCount, invalidCount: totalInvalid, matchedCount: 0,
      unmatchedCount: 0, needsReviewCount: 0, createdAt: now,
    };
    importedWorkspace.imports.unshift(importRecord);
    importedWorkspace.auditLogs.push(recordAudit(importedWorkspace, `import.${kind}`, "import", importId, {
      fileName: importRecord.fileName, rowsSeen: importRecord.rowsSeen, importedCount: importRecord.importedCount, duplicateCount: dupeCount, invalidCount: importRecord.invalidCount,
    }, now));

    if (kind === "transactions" || kind === "orders") {
      importedWorkspace = reconcileWorkspace(importedWorkspace, { autoMatch: true, now });
    }
    if (kind === "transactions") {
      const imported = importedWorkspace.transactions.filter((transaction) => transaction.importId === importId);
      matched = imported.filter((transaction) => transaction.matchStatus === "matched").length;
      review = imported.filter((transaction) => transaction.matchStatus === "possible").length;
      unmatched = imported.filter((transaction) => transaction.matchStatus === "unmatched").length;
    }
    importedWorkspace.imports = importedWorkspace.imports.map((record) => record.id === importId ? {
      ...record, matchedCount: matched, needsReviewCount: review, unmatchedCount: unmatched,
    } : record);
    commit(() => importedWorkspace);
    setSummary({ accepted: validation.valid.length, duplicates: dupeCount, invalid: totalInvalid, matched, review, unmatched, customersCreated });
    setComplete(true);
    setBusy(false);
  }

  const title = kind === "transactions" ? "Import transactions" : kind === "orders" ? "Import orders" : "Import customers";
  const duplicateMessage = kind === "transactions" ? "Likely duplicates are still imported and flagged for review." : kind === "orders" ? "Repeated order references are still imported and marked." : "Matching customer rows are merged into one contact; the duplicate count is recorded.";
  const previewFields = kind === "transactions" ? ["transactionDate", "amount", "reference", "description"] : kind === "orders" ? ["orderNumber", "customerName", "orderDate", "amount"] : ["name", "phone", "email"];

  return <Modal title={complete ? "Import complete" : title} description={complete ? "Your rows have been added to the workspace." : "Preview, map and validate first. The raw CSV is not uploaded or retained."} onClose={onClose} wide>
    <div className="import-steps"><span className="import-step done"><b><Check size={11} /></b>Upload</span><i className="import-step-line" /><span className={`import-step ${parsed && !complete ? "active" : complete ? "done" : ""}`}><b>{complete ? <Check size={11} /> : "2"}</b>Map &amp; review</span><i className="import-step-line" /><span className={`import-step ${complete ? "active" : ""}`}><b>3</b>Import</span></div>
    <div className="modal-body">
      {complete && summary ? <>
        <div className="form-success"><Check size={15} /> {summary.accepted} valid row{summary.accepted === 1 ? "" : "s"} processed from {fileName || "the CSV"}. Parser and validation issues are counted; invalid rows were not imported.</div>
        <div className="import-summary-grid" style={{ marginTop: 13 }}>
          <div className="import-summary-item"><strong>{summary.accepted}</strong><span>Valid rows processed</span></div>
          <div className="import-summary-item"><strong>{summary.duplicates}</strong><span>Duplicate candidates</span></div>
          <div className="import-summary-item"><strong>{summary.invalid}</strong><span>Rows needing correction</span></div>
          {kind === "transactions" ? <div className="import-summary-item"><strong>{summary.matched}</strong><span>Linked with rules</span></div> : <div className="import-summary-item"><strong>{summary.customersCreated}</strong><span>New customer records</span></div>}
        </div>
        {kind === "transactions" && <div className="inline-notice">{summary.review} payment rows need a human match review · {summary.unmatched} incoming rows remain unlinked. All valid statement rows are preserved, including duplicate candidates.</div>}
        <div className="form-actions" style={{ marginTop: 18 }}><Button onClick={onClose}>Done <Check size={15} /></Button></div>
      </> : !parsed ? <>
        <div className="upload-zone"><div className="upload-icon"><FileSpreadsheet size={20} /></div><strong>Choose a CSV file to get started</strong><p>CSV only · up to 10 MB · the preview stays in this browser</p><label className="file-label"><Upload size={13} /> {busy ? "Reading file…" : "Choose CSV"}<input type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event)} disabled={busy} /></label></div>
        {fileError && <div className="form-error" style={{ marginTop: 12 }}><AlertCircle size={14} />{fileError}</div>}
        <div className="inline-notice" style={{ marginTop: 13 }}><LockKeyhole size={13} style={{ display: "inline", marginRight: 5 }} />Demo mode is stored only in this browser. Use fictional data here; connected mode saves normalized rows to your configured Supabase workspace.</div>
        <div className="form-actions" style={{ justifyContent: "space-between", marginTop: 15 }}><button className="text-button" onClick={() => {
          const sampleDate = businessDate(new Date(), workspace.business);
          const exampleAmount = formatBusinessMoney(85_000, workspace.business);
          const examples: Record<ImportKind, Array<Record<string, string | number>>> = {
            customers: [{ name: "Example customer", phone: "", email: "", notes: "" }],
            orders: [{ order_number: "ORD-1001", customer_name: "Example customer", customer_phone: "", order_date: sampleDate, due_date: addDaysIso(sampleDate, 7), amount: exampleAmount, paid: 0 }],
            transactions: [{ transaction_date: sampleDate, reference: "TX-123456", description: "Transfer from Example customer", amount: exampleAmount, type: "credit", sender_name: "Example customer", channel: "Bank transfer" }],
          };
          const columns = Object.keys(examples[kind][0]);
          const content = [columns.join(","), ...examples[kind].map((row) => columns.map((column) => `"${String(row[column] ?? "").replace(/"/g, '""')}"`).join(","))].join("\r\n");
          const link = document.createElement("a"); const url = URL.createObjectURL(new Blob(["\ufeff", content], { type: "text/csv" })); link.href = url; link.download = `moneytrail-${kind}-template.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
        }}>Download a sample CSV template</button><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
      </> : <>
        <div className="upload-complete-row"><div className="upload-icon"><FileSpreadsheet size={18} /></div><div style={{ flex: 1 }}><strong className="primary-cell">{fileName}</strong><span className="secondary-cell">{parsed.rows.length} data rows · {parsed.headers.length} columns</span></div><button className="text-button" onClick={() => { setParsed(null); setFileName(""); setMapping({}); }}>Choose another file</button></div>
        {parseErrors.length > 0 && <div className="form-error" style={{ margin: "12px 0" }}><AlertCircle size={14} />{parseErrors.slice(0, 3).join(" · ")}{parseErrors.length > 3 ? ` · +${parseErrors.length - 3} more` : ""}</div>}
        <div className="inline-notice" style={{ margin: "12px 0" }}><strong>{validation.valid.length}</strong> valid · <strong>{validation.invalid.length + parseErrors.length}</strong> parser / validation issues · <strong>{duplicates.size}</strong> likely duplicates. {duplicateMessage}</div>
        {requiredMissing.length > 0 && <div className="form-error" style={{ margin: "0 0 13px" }}><AlertCircle size={14} />Map required fields: {requiredMissing.join(", ")}.</div>}
        <div className="mapping-grid">{IMPORT_FIELDS[kind].map((field) => <label className="field" key={field.key}><span>{field.label}{field.required && kind !== "transactions" ? " *" : ""}</span><select value={mapping[field.key] ?? ""} onChange={(event) => updateMapping(field.key, event.target.value)}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
        <div className="mapping-preview"><h4>Preview · first {Math.min(validation.valid.length + validation.invalid.length, 6)} rows</h4><div className="table-wrap"><table className="data-table"><thead><tr><th>Row</th><th>Check</th>{previewFields.map((field) => <th key={field}>{IMPORT_FIELDS[kind].find((item) => item.key === field)?.label}</th>)}</tr></thead><tbody>
          {parsed.rows.slice(0, 6).map((row) => {
            const invalid = validation.invalid.find((item) => item.line === row.line);
            const validRow = validation.valid.find((item) => item.line === row.line);
            const duplicate = duplicates.has(row.line);
            const values = validRow as CsvRow | undefined;
            return <tr key={row.line}><td>{row.line}</td><td>{invalid ? <span style={{ color: "#b84134" }}>{invalid.reasons[0]}</span> : duplicate ? <span style={{ color: "#a86114" }}>Possible duplicate</span> : <span style={{ color: "#38825a" }}>Valid</span>}</td>{previewFields.map((field) => <td key={field}>{String(values ? (values as unknown as Record<string, unknown>)[field] ?? "—" : row.values[mapping[field as keyof ColumnMapping] ?? ""] ?? "—")}</td>)}</tr>;
          })}
        </tbody></table></div></div>
        {validation.invalid.length > 0 && <details style={{ marginTop: 10 }}><summary className="text-button">View {validation.invalid.length} row validation issue{validation.invalid.length === 1 ? "" : "s"}</summary><button className="text-button" style={{ marginTop: 8 }} onClick={() => downloadCsv(`moneytrail-${kind}-invalid-rows.csv`, validation.invalid.map((row) => ({ ...row.raw, line: row.line, errors: row.reasons.join("; ") })))}>Download invalid rows</button><div className="invalid-list">{validation.invalid.slice(0, 10).map((row) => <div key={row.line}><strong>Row {row.line}:</strong> {row.reasons.join(" ")}</div>)}{validation.invalid.length > 10 && <span>+{validation.invalid.length - 10} more row(s)</span>}</div></details>}
        <div className="form-actions" style={{ justifyContent: "space-between", marginTop: 16 }}><span className="fine-print">No row is discarded without a count and reason. {mode === "demo" ? "Demo data is browser-local." : "Raw files are not retained."}</span><div style={{ display: "flex", gap: 8 }}><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={importRows} disabled={busy || validation.valid.length === 0 || requiredMissing.length > 0}>{busy ? "Importing…" : `Import ${validation.valid.length} valid row${validation.valid.length === 1 ? "" : "s"}`}<ArrowRight size={14} /></Button></div></div>
      </>}
    </div>
  </Modal>;
}
