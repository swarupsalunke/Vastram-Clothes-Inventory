import React, { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { LayoutDashboard, Package, ReceiptText, History, Users, CalendarCheck, Wallet, Truck, Menu, Search, Plus, Eye, Pencil, Trash2, X, Shirt, IndianRupee, AlertTriangle, RefreshCw } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const nav = [
  ["Dashboard", "dashboard", LayoutDashboard], ["Products & Stock", "products", Package], ["Billing", "billing", ReceiptText],
  ["Bill History", "bills", History], ["Worker Details", "workers", Users], ["Attendance & Salary", "attendance", CalendarCheck],
  ["Expenses", "expenses", Wallet], ["Suppliers", "suppliers", Truck]
];
const blank = { products: { name: "", sku: "", category: "Shirts", size: "M", color: "", quantity: 0, price: 0, reorderLevel: 5 }, workers: { name: "", phone: "", role: "Sales Staff", joiningDate: "", dailySalary: 0, address: "" }, attendance: { workerId: "", workerName: "", date: new Date().toISOString().slice(0, 10), status: "Present", remarks: "" }, expenses: { title: "", category: "Shop Expense", amount: 0, date: new Date().toISOString().slice(0, 10), notes: "" }, suppliers: { name: "", company: "", phone: "", email: "", address: "" } };
const money = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
async function request(path, options = {}) {
  const r = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || "Request failed");
  return data;
}
export default function App() {
  const [page, setPage] = useState("dashboard"), [mobileOpen, setMobileOpen] = useState(false);
  const [data, setData] = useState({}), [dash, setDash] = useState({}), [query, setQuery] = useState(""), [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null), [form, setForm] = useState({}), [viewRecord, setViewRecord] = useState(null);
  const [billItems, setBillItems] = useState([]), [customer, setCustomer] = useState({ customerName: "", customerPhone: "", paymentMethod: "Cash" });
  const [billProduct, setBillProduct] = useState(""), [billQty, setBillQty] = useState(1), [month, setMonth] = useState(new Date().toISOString().slice(0, 7)), [salary, setSalary] = useState(null);
  const resource = page === "bills" ? "bills" : page;
  const load = async () => {
    setLoading(true);
    try {
      if (page === "dashboard") { setDash(await request("/dashboard")); }
      else if (page === "billing") {
        const products = await request("/products");
        setData(p => ({ ...p, products }));
      }
      else if (["products", "workers", "attendance", "bills", "expenses", "suppliers"].includes(page)) {
        const rows = await request("/" + page + (query ? "?q=" + encodeURIComponent(query) : ""));
        setData(p => ({ ...p, [page]: rows }));
        if (page === "attendance") {
          const w = await request("/workers");
          setData(p => ({ ...p, workers: w }));
        }
      }
    } catch (e) { toast.error(e.message + " — check that backend and MongoDB are running."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [page, query]);
  const rows = data[resource] || [];
  const openCreate = () => { setForm({ ...blank[page] }); setModal({ type: "create", resource: page }); };
  const openEdit = (r) => { setForm({ ...r }); setModal({ type: "edit", resource: page, id: r._id }); };
  const save = async () => {
    try {
      const r = modal.resource; const payload = { ...form }; delete payload._id; delete payload.__v; delete payload.createdAt; delete payload.updatedAt;
      await request("/" + r + (modal.type === "edit" ? "/" + modal.id : ""), { method: modal.type === "edit" ? "PUT" : "POST", body: JSON.stringify(payload) });
      setModal(null); toast.success(modal.type === "edit" ? "Record updated successfully" : "Record added successfully"); await load();
    } catch (e) { toast.error(e.message); }
  };
  const remove = async (r) => {
    if (!confirm("Delete this record permanently?")) return;
    try { await request("/" + page + "/" + r._id, { method: "DELETE" }); toast.success("Record deleted successfully"); await load(); } catch (e) { toast.error(e.message); }
  };
  const addBillItem = () => {
    const p = (data.products || []).find(x => x._id === billProduct);
    if (!p) return toast.error("Please select a product.");
    if (Number(billQty) < 1 || Number(billQty) > Number(p.quantity)) return toast.error("Quantity exceeds available stock.");
    const found = billItems.find(x => x.productId === p._id);
    if (found) { setBillItems(billItems.map(x => x.productId === p._id ? { ...x, quantity: Number(x.quantity) + Number(billQty) } : x)); }
    else setBillItems([...billItems, {
      productId: p._id,
      name: p.name,
      sku: p.sku,
      originalPrice: Number(p.price || 0),
      price: Number(p.price || 0),
      quantity: Number(billQty)
    }]);
    setBillProduct(""); setBillQty(1);
  };
  const createBill = async () => {
    try {
      const bill = await request("/bills/create", {
        method: "POST", body: JSON.stringify({
          ...customer, items: billItems.map(x => ({
            productId: x.productId,
            quantity: Number(x.quantity),
            originalPrice: Number(x.originalPrice ?? x.price),
            price: Number(x.price)
          }))
        })
      });
      toast.success("Bill saved successfully: " + bill.invoiceNo); setBillItems([]); setCustomer({ customerName: "", customerPhone: "", paymentMethod: "Cash" }); setPage("bills");
    } catch (e) { toast.error(e.message); }
  };
  const runSalary = async (workerId) => {
    if (!workerId) return setSalary(null);
    try { setSalary(await request(`/workers/${workerId}/salary?month=${month}`)); } catch (e) { toast.error(e.message); }
  };
  const title = nav.find(n => n[1] === page)?.[0] || "Dashboard";
  const displayRows = page === "bills" ? rows : rows;
  return <div className="app-shell">
    <Toaster position="top-right" richColors closeButton />
    <aside className={`sidebar ${mobileOpen ? "show" : ""}`}>
      <div className="brand"><div className="brand-icon"><Shirt size={22} /></div><div><b>Vastram</b><small>Men's, Women's & Kid's Wear</small></div><button className="close-side" onClick={() => setMobileOpen(false)}><X /></button></div>
      <div className="nav-label">WORKSPACE</div>
      {nav.map(([label, key, Icon]) => <button key={key} className={"nav-item " + (page === key ? "active" : "")} onClick={() => { setPage(key); setMobileOpen(false); setQuery(""); }}><Icon size={18} /><span>{label}</span>{key === "products" && <span className="nav-dot" />}</button>)}
      <div className="sidebar-bottom"><div className="shop-avatar">V</div><div><b>Vastram</b><small>Inventory workspace</small></div></div>
    </aside>
    {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}
    <main className="main">
      <header className="topbar"><button className="menu-btn" onClick={() => setMobileOpen(true)}><Menu /></button><div className="crumb">Workspace <span>/</span> <b>{title}</b></div><div className="top-right"><span className="status-dot" /> Admin - Rohit <div className="user-circle">V.</div></div></header>
      <div className="content">
        {loading && <div className="loading"><RefreshCw size={16} /> Loading data…</div>}
        {page === "dashboard" && <Dashboard dash={dash} setPage={setPage} />}
        {page === "billing" && <section>
          <PageHead title="Create a bill" sub="Create a customer invoice and automatically update stock." />
          <div className="billing-grid">
            <div className="panel"><h3>Customer details</h3><div className="form-grid"><Field label="Customer name (optional)" value={customer.customerName} onChange={v => setCustomer({ ...customer, customerName: v })} /><Field label="Phone (optional)" value={customer.customerPhone} onChange={v => setCustomer({ ...customer, customerPhone: v })} /><label className="field"><span>Payment method</span><select value={customer.paymentMethod} onChange={e => setCustomer({ ...customer, paymentMethod: e.target.value })}><option>Cash</option><option>UPI</option><option>Card</option><option>Credit</option></select></label></div>
              <h3 className="section-gap">Add products</h3><div className="add-product"><select value={billProduct} onChange={e => setBillProduct(e.target.value)}><option value="">Choose product</option>{(data.products || []).map(p => <option key={p._id} value={p._id}>{p.name} · Stock {p.quantity} · {money(p.price)}</option>)}</select><input type="number" min="1" value={billQty} onChange={e => setBillQty(e.target.value)} /><button className="primary" onClick={addBillItem}><Plus size={16} /> Add</button></div>
              <div className="table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Original price</th><th>Selling price (editable)</th><th>Discount</th><th>Total</th><th></th></tr></thead><tbody>{billItems.map(i => {
                const discount = Math.max(0, Number(i.originalPrice || 0) - Number(i.price || 0));
                return <tr key={i.productId}>
                  <td><div className="main-cell">{i.name}</div><small className="muted">{i.sku || ""}</small></td>
                  <td><input aria-label={"Quantity for " + i.name} className="bill-edit-input qty-input" type="number" min="1" value={i.quantity} onChange={e => {
                    const value = Math.max(1, Number(e.target.value || 1));
                    const product = (data.products || []).find(p => p._id === i.productId);
                    if (product && value > Number(product.quantity || 0)) { toast.error("Quantity exceeds available stock for " + i.name); return; }
                    setBillItems(items => items.map(x => x.productId === i.productId ? { ...x, quantity: value } : x));
                  }} /></td>
                  <td>{money(i.originalPrice)}</td>
                  <td><input aria-label={"Selling price for " + i.name} className="bill-edit-input price-input" type="number" min="0" step="0.01" value={i.price} onChange={e => {
                    const value = e.target.value;
                    setBillItems(items => items.map(x => x.productId === i.productId ? { ...x, price: value === "" ? 0 : Math.max(0, Number(value)) } : x));
                  }} /></td>
                  <td><span className={discount > 0 ? "discount-value" : "muted"}>{discount > 0 ? money(discount) : "—"}</span></td>
                  <td><b>{money(Number(i.price) * Number(i.quantity))}</b></td>
                  <td><button title="Remove item" className="icon-btn danger" onClick={() => setBillItems(billItems.filter(x => x.productId !== i.productId))}><Trash2 size={15} /></button></td>
                </tr>;
              })}{!billItems.length && <Empty col={7} text="Add products to start the bill." />}</tbody></table></div>
            </div>
            <div className="panel bill-summary"><div className="summary-icon"><ReceiptText /></div><h3>Invoice summary</h3><p>Items in bill <b>{billItems.reduce((s, i) => s + Number(i.quantity), 0)}</b></p><p>Subtotal <b>{money(billItems.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0))}</b></p><div className="total-row"><span>Total due</span><strong>{money(billItems.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0))}</strong></div><button className="primary full" disabled={!billItems.length} onClick={createBill}>Save bill</button><small>Saving a bill deducts sold quantities from stock.</small></div>
          </div>
        </section>}
        {["products", "workers", "attendance", "bills", "expenses", "suppliers"].includes(page) && <section>
          <PageHead title={title} sub={({ products: "Track clothing items, prices and available stock.", workers: "Maintain staff information and daily salary.", attendance: "Mark daily attendance and calculate monthly payable salary.", bills: "Browse saved invoices and open invoice details.", expenses: "Record shop rent, electricity and other expenses.", suppliers: "Manage wholesalers and supplier contact details." })[page]} action={["products", "workers", "attendance", "expenses", "suppliers"].includes(page) ? <button className="primary" onClick={openCreate}><Plus size={17} /> Add {({ products: "Product", workers: "Worker", attendance: "Attendance", expenses: "Expense", suppliers: "Supplier" })[page]}</button> : null} />
          {page === "attendance" && <div className="panel salary-panel"><div><h3>Manage salary</h3><p>Choose a worker and month to calculate payable salary from attendance records.</p></div><select id="salary-worker" defaultValue="" onChange={e => runSalary(e.target.value)}><option value="">Select worker</option>{(data.workers || []).map(w => <option key={w._id} value={w._id}>{w.name} — {money(w.dailySalary)}/day</option>)}</select><input type="month" value={month} onChange={e => { setMonth(e.target.value); const id = document.getElementById("salary-worker")?.value; if (id) runSalary(id); }} />{salary && <div className="salary-result"><span>{salary.workerName} · {salary.month}</span><b>{salary.payableDays} payable days</b><strong>{money(salary.salary)}</strong></div>}</div>}
          <div className="toolbar"><div className="searchbox"><Search size={17} /><input placeholder={"Search " + title.toLowerCase() + "…"} value={query} onChange={e => setQuery(e.target.value)} /></div><button className="secondary" onClick={load}><RefreshCw size={15} /> Refresh</button><span className="record-count">{rows.length} records</span></div>
          <div className="panel table-panel"><div className="table-wrap"><table><thead><tr>{(page === "products" ? ["Product", "SKU", "Category", "Size / Color", "Stock", "Price", "Actions"] : page === "workers" ? ["Worker", "Phone", "Role", "Joining date", "Daily salary", "Actions"] : page === "attendance" ? ["Worker", "Date", "Status", "Remarks", "Actions"] : page === "bills" ? ["Invoice", "Customer", "Date", "Payment", "Items", "Total", "Actions"] : page === "expenses" ? ["Expense", "Category", "Date", "Amount", "Notes", "Actions"] : ["Supplier", "Company", "Phone", "Email", "Address", "Actions"]).map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
            {rows.map(r => <tr key={r._id}>
              {page === "products" && <><td><div className="main-cell">{r.name || "—"}</div><small className="muted">{r.color || "No color"}</small></td><td>{r.sku || "—"}</td><td>{r.category || "—"}</td><td>{[r.size, r.color].filter(Boolean).join(" / ") || "—"}</td><td><span className={"stock " + (Number(r.quantity) <= 5 ? "low" : "")}>{r.quantity ?? 0}</span></td><td>{money(r.price)}</td></>}
              {page === "workers" && <><td><div className="person"><span className="person-icon">{(r.name || "W").slice(0, 1).toUpperCase()}</span><b>{r.name}</b></div></td><td>{r.phone || "—"}</td><td>{r.role || "—"}</td><td>{r.joiningDate || "—"}</td><td>{money(r.dailySalary)}</td></>}
              {page === "attendance" && <><td><b>{r.workerName || "—"}</b></td><td>{r.date || "—"}</td><td><span className={"pill " + String(r.status || "").toLowerCase().replace(" ", "-")}>{r.status || "—"}</span></td><td>{r.remarks || "—"}</td></>}
              {page === "bills" && <><td><b>{r.invoiceNo || "—"}</b></td><td>{r.customerName || "Walk-in customer"}</td><td>{new Date(r.billDate || r.createdAt).toLocaleDateString("en-IN")}</td><td>{r.paymentMethod || "Cash"}</td><td>{(r.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0)}</td><td><b>{money(r.total)}</b></td></>}
              {page === "expenses" && <><td><b>{r.title || "—"}</b></td><td>{r.category || "—"}</td><td>{r.date || "—"}</td><td>{money(r.amount)}</td><td>{r.notes || "—"}</td></>}
              {page === "suppliers" && <><td><b>{r.name || "—"}</b></td><td>{r.company || "—"}</td><td>{r.phone || "—"}</td><td>{r.email || "—"}</td><td>{r.address || "—"}</td></>}
              <td><div className="actions"><button title="View" className="icon-btn" onClick={() => setViewRecord(r)}><Eye size={16} /></button>{page !== "bills" && <><button title="Edit" className="icon-btn" onClick={() => openEdit(r)}><Pencil size={15} /></button><button title="Delete" className="icon-btn danger" onClick={() => remove(r)}><Trash2 size={15} /></button></>}</div></td>
            </tr>)}{!rows.length && <Empty col={page === "bills" ? 7 : page === "products" ? 7 : page === "workers" ? 6 : page === "attendance" ? 5 : page === "expenses" ? 6 : 6} text={loading ? "Loading…" : "No records yet. Add your first record to get started."} />}
          </tbody></table></div></div>
        </section>}
      </div>
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null) }}><div className="modal"><div className="modal-head"><div><h2>{modal.type === "edit" ? "Edit" : "Add"} {modal.resource.slice(0, -1).replace(/^./, c => c.toUpperCase())}</h2><p>Fields marked with * are recommended.</p></div><button className="icon-btn" onClick={() => setModal(null)}><X /></button></div><div className="form-grid">{Object.entries(form).filter(([k]) => !["_id", "__v", "createdAt", "updatedAt", "items", "total", "invoiceNo", "billDate"].includes(k)).map(([k, v]) => <label className="field" key={k}><span>{pretty(k)}</span>{k === "status" && modal.resource === "attendance" ? <select value={v || "Present"} onChange={e => setForm({ ...form, [k]: e.target.value })}><option>Present</option><option>Absent</option><option>Half Day</option><option>Leave</option></select> : k === "workerId" ? <select value={v || ""} onChange={e => { const w = (data.workers || []).find(x => x._id === e.target.value); setForm({ ...form, workerId: e.target.value, workerName: w?.name || "" }) }}><option value="">Select worker</option>{(data.workers || []).map(w => <option key={w._id} value={w._id}>{w.name}</option>)}</select> : k === "date" || k === "joiningDate" ? <input type="date" value={v || ""} onChange={e => setForm({ ...form, [k]: e.target.value })} /> : ["quantity", "price", "dailySalary", "amount", "reorderLevel"].includes(k) ? <input type="number" min="0" value={v ?? 0} onChange={e => setForm({ ...form, [k]: e.target.value })} /> : k === "address" || k === "notes" || k === "remarks" ? <textarea value={v || ""} onChange={e => setForm({ ...form, [k]: e.target.value })} /> : <input value={v ?? ""} onChange={e => setForm({ ...form, [k]: e.target.value })} />}</label>)}</div><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="primary" onClick={save}>Save record</button></div></div></div>}
    {viewRecord && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setViewRecord(null) }}><div className="modal"><div className="modal-head"><div><h2>Record details</h2><p>Saved information from the database</p></div><button className="icon-btn" onClick={() => setViewRecord(null)}><X /></button></div><div className="detail-grid">{Object.entries(viewRecord).filter(([k, v]) => !["_id", "__v"].includes(k) && typeof v !== "object").map(([k, v]) => <div className="detail-item" key={k}><small>{pretty(k)}</small><b>{String(v ?? "—")}</b></div>)}{viewRecord.items && <div className="detail-wide"><h3>Invoice items</h3>{viewRecord.items.map((i, n) => <p key={n}>
      {i.name} × {i.quantity} — Sold at {money(i.price)} each = {money(i.lineTotal ?? (Number(i.price || 0) * Number(i.quantity || 0)))}
      {Number(i.originalPrice ?? i.price) > Number(i.price || 0) && <span className="muted"> (Original {money(i.originalPrice)}; discount {money(Number(i.originalPrice) - Number(i.price))} per piece)</span>}
    </p>)}<h3>Total: {money(viewRecord.total)}</h3></div>}</div><div className="modal-actions"><button className="primary" onClick={() => setViewRecord(null)}>Close</button></div></div></div>}
  </div>
}
function pretty(s) { return s.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()) }
function PageHead({ title, sub, action }) { return <div className="page-head"><div><div className="eyebrow">CLOTHING SHOP OPERATIONS</div><h1>{title}</h1><p>{sub}</p></div>{action}</div> }
function Field({ label, value, onChange }) { return <label className="field"><span>{label}</span><input value={value} onChange={e => onChange(e.target.value)} /></label> }
function Empty({ col, text }) { return <tr><td colSpan={col} className="empty">{text}</td></tr> }
function Dashboard({ dash, setPage }) {
  const stats = [["Products in stock", dash.productCount || 0, Package, "#edf4ff"], ["Total workers", dash.workerCount || 0, Users, "#eaf8f0"], ["Bills created", dash.billCount || 0, ReceiptText, "#fff3e8"], ["Sales revenue", money(dash.revenue), IndianRupee, "#f3edff"]];
  return <section><PageHead title="Good day, shop owner" sub="Here's what's happening in your clothing shop today." action={<button className="primary" onClick={() => setPage("billing")}><Plus size={17} /> Create new bill</button>} />
    <div className="welcome-card"><div><span className="welcome-tag">SHOP OVERVIEW</span><h2>Keep your shop running smoothly.</h2><p>Manage stock, bills, staff attendance and expenses from one place.</p><button className="welcome-btn" onClick={() => setPage("products")}>Manage inventory <span>→</span></button></div><div className="welcome-art"><div className="hanger">⌁</div><Shirt size={76} strokeWidth={1.1} /><div className="art-tag">NEW SEASON</div></div></div>
    <div className="stats-grid">{stats.map(([label, val, Icon, bg]) => <div className="stat-card" key={label}><div className="stat-icon" style={{ background: bg }}><Icon size={20} /></div><span>{label}</span><strong>{val}</strong><small>Current database totals</small></div>)}</div>
    <div className="dashboard-lower"><div className="panel"><div className="panel-title"><div><h3>Low stock alerts</h3><p>Products with 5 or fewer pieces remaining</p></div><button className="text-btn" onClick={() => setPage("products")}>View inventory →</button></div>{(dash.lowStock || []).slice(0, 5).map(p => <div className="low-row" key={p._id}><div className="product-mini"><Package size={17} /></div><div className="low-name"><b>{p.name}</b><small>{p.sku || p.category || "Product"}</small></div><span className="stock low">{p.quantity} left</span></div>)}{!(dash.lowStock || []).length && <div className="empty-block">All good — no low stock products.</div>}</div>
      <div className="panel quick-panel"><h3>Quick actions</h3><p>Jump into common tasks.</p>{[["Create a bill", "billing", ReceiptText], ["Add new product", "products", Package], ["Mark attendance", "attendance", CalendarCheck], ["Add shop expense", "expenses", Wallet]].map(([t, k, I]) => <button className="quick-action" key={k} onClick={() => setPage(k)}><span><I size={17} /></span>{t}<b>→</b></button>)}</div></div>
    <div className="bottom-note"><span className="status-dot" /> Inventory is stored in your connected MongoDB database <span className="note-right">Expenses recorded: {money(dash.expenseTotal)}</span></div>
  </section>
}
