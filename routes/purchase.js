import React, { useEffect, useState } from "react";

/* ===============================
   HELPERS (DECIMAL SAFE)
=============================== */
const formatInput = (v) => {
  if (v === "" || v === null || v === undefined) return "";
  // allow digits and one dot
  let clean = v.replace(/[^0-9.]/g, "");
  const parts = clean.split(".");
  if (parts.length > 2) clean = parts[0] + "." + parts[1];
  return clean;
};

const parseNumber = (v) => {
  if (v === "" || v === null || v === undefined) return 0;
  return parseFloat(String(v).replace(/,/g, "")) || 0;
};

/* ===============================
   ITEM CATEGORY COLOR
=============================== */
const itemCategoryColor = (text = "") => {
  const t = text.toLowerCase();
  if (t.includes("transport")) return "#0d6efd";
  if (t.includes("hotel")) return "#198754";
  if (t.includes("visa")) return "#6f42c1";
  if (t.includes("ticket")) return "#fd7e14";
  if (t.includes("ziyarat")) return "#dc3545";
  return "#212529";
};

export default function Purchase({ onNavigate }) {
  const [refNo, setRefNo] = useState("");
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(false);

  /* ================= LOAD SUPPLIERS ================= */
  useEffect(() => {
    fetch(`${import.meta.env.VITE_BACKEND_URL}/api/supplier/list`)
      .then((r) => r.json())
      .then((d) => d.success && setSuppliers(d.rows || []));
  }, []);

  /* ================= LOAD PENDING ================= */
  const loadPending = async () => {
    const r = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/purchase/pending`
    );
    const d = await r.json();
    if (d.success) setPending(d.rows || []);
  };

  useEffect(() => {
    loadPending();
  }, []);

  /* ================= LOAD PACKAGE (MANUAL) ================= */
  const loadPackage = async (r = refNo) => {
    if (!r) return alert("Ref No required");
    setRefNo(r);
    setLoading(true);

    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/purchase/load/${r}`
    );
    const data = await res.json();
    setLoading(false);

    if (!data.success) {
      alert(data.error || "Not found");
      setRows([]);
      return;
    }

    setIsEdit(data.is_edit === true);

    setRows(
      data.rows.map((x) => ({
        item: x.item,
        item_label: x.item_label,
        sale_sar: parseNumber(x.sale_sar),
        sale_rate: parseNumber(x.sale_rate),
        sale_pkr: parseNumber(x.sale_pkr),
        purchase_sar: x.purchase_sar ? formatInput(String(x.purchase_sar)) : "",
        purchase_rate: x.purchase_rate ? formatInput(String(x.purchase_rate)) : "",
        purchase_pkr: parseNumber(x.purchase_pkr),
        profit: parseNumber(x.profit),
        supplier_code: x.supplier_code || "",
        supplier_name: x.supplier_name || "",
      }))
    );
  };

  /* ================= UPDATE ROW ================= */
  const updateRow = (i, field, value) => {
    const copy = [...rows];
    const r = copy[i];

    if (field === "supplier_code") {
      r.supplier_code = value;
      const s = suppliers.find((x) => x.supplier_code === value);
      r.supplier_name = s ? s.supplier_name : "";
    } else {
      r[field] = formatInput(value); // decimal-safe input
    }

    const sar = parseNumber(r.purchase_sar);
    const rate = parseNumber(r.purchase_rate);
    r.purchase_pkr = sar * rate;
    r.profit = r.sale_pkr - r.purchase_pkr;

    setRows(copy);
  };

  /* ================= SAVE ================= */
  const savePurchase = async () => {
    if (!rows.length) return alert("No data");

    const cleanRows = rows.map((r) => ({
      ...r,
      purchase_sar: parseNumber(r.purchase_sar),
      purchase_rate: parseNumber(r.purchase_rate),
    }));

    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/purchase/save`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref_no: refNo, items: cleanRows }),
      }
    );

    const data = await res.json();

    if (data.success) {
      alert(isEdit ? "✅ Purchase Updated" : "✅ Purchase Saved");
      setRows([]);
      setRefNo("");
      setIsEdit(false);
      loadPending();
      onNavigate("dashboard");
    } else {
      alert(data.error || "Save failed");
    }
  };

  const isPartial =
    rows.length > 0 &&
    rows.some(
      (r) =>
        !parseNumber(r.purchase_sar) ||
        !parseNumber(r.purchase_rate)
    );

  /* ================= UI ================= */
  return (
    <div className="container p-3">

      {/* HEADER */}
      <div className="card shadow-sm mb-3">
        <div className="card-body d-flex justify-content-between mb-2">
          <h4 className="fw-bold mb-0">
            🧾 Purchase Entry
            {isEdit && (
              <span className="badge bg-warning text-dark ms-2">
                EDIT MODE
              </span>
            )}
          </h4>

          <div className="d-flex gap-2">
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => onNavigate("dashboard")}
            >
              ⬅ Back
            </button>
            <button
              className="btn btn-success btn-sm"
              onClick={savePurchase}
            >
              💾 {isEdit ? "Update Purchase" : "Save Purchase"}
            </button>
          </div>
        </div>
      </div>

      {isPartial && (
        <div className="alert alert-warning fw-bold">
          ⚠️ Purchase PARTIAL hai
        </div>
      )}

      {/* PENDING LIST */}
      <div className="card shadow-sm mb-3">
        <div className="card-header fw-bold text-danger">
          ⏳ Pending / Partial Purchases
        </div>
        <div className="card-body p-2">
          {pending.length === 0 ? (
            <p className="text-success mb-0">✅ No pending</p>
          ) : (
            <ul className="list-group list-group-flush">
              {pending.map((p, i) => (
                <li
                  key={i}
                  className="list-group-item d-flex justify-content-between align-items-center"
                >
                  <div className="fw-bold">
                    <span className={`badge bg-secondary me-2`}>
                      {p.ref_no}
                    </span>
                    <span className="text-primary ms-1">{p.customer_name}</span>
                    <span
                      className={`badge ms-2 ${
                        p.status === "PENDING"
                          ? "bg-danger"
                          : "bg-warning text-dark"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => loadPackage(p.ref_no)}
                  >
                    Load
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* MANUAL REF NO ENTRY */}
      <div className="card shadow-sm mb-3">
        <div className="card-header fw-bold text-info">
          🔢 Enter Ref No Manually
        </div>
        <div className="card-body d-flex gap-2">
          <input
            className="form-control form-control-sm"
            placeholder="Ref No"
            value={refNo}
            onChange={(e) => setRefNo(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => loadPackage()}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load"}
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="card shadow">
        <div className="table-responsive">
          <table className="table table-sm table-hover mb-0">
            <thead className="table-dark sticky-top">
              <tr>
                <th>Item</th>
                <th>Sale SAR</th>
                <th>Rate</th>
                <th>Sale PKR</th>
                <th>Purchase SAR</th>
                <th>Purchase Rate</th>
                <th>Purchase PKR</th>
                <th>Profit</th>
                <th>Supplier</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td
                    className="fw-bold"
                    style={{
                      fontSize: "13px",
                      color: itemCategoryColor(r.item_label || r.item),
                    }}
                  >
                    {r.item_label || r.item}
                  </td>
                  <td>{r.sale_sar}</td>
                  <td>{r.sale_rate}</td>
                  <td>{r.sale_pkr.toLocaleString()}</td>

                  <td>
                    <input
                      className="form-control form-control-sm"
                      value={r.purchase_sar}
                      onChange={(e) =>
                        updateRow(i, "purchase_sar", e.target.value)
                      }
                    />
                  </td>

                  <td>
                    <input
                      className="form-control form-control-sm"
                      value={r.purchase_rate}
                      onChange={(e) =>
                        updateRow(i, "purchase_rate", e.target.value)
                      }
                    />
                  </td>

                  <td>{r.purchase_pkr.toLocaleString()}</td>

                  <td
                    className={`fw-bold ${
                      r.profit >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {r.profit.toLocaleString()}
                  </td>

                  <td>
                    <select
                      className="form-select form-select-sm"
                      value={r.supplier_code}
                      onChange={(e) =>
                        updateRow(i, "supplier_code", e.target.value)
                      }
                    >
                      <option value="">Select Supplier</option>
                      {suppliers.map((s) => (
                        <option
                          key={s.supplier_code}
                          value={s.supplier_code}
                        >
                          {s.supplier_name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>

          </table>
        </div>
      </div>

    </div>
  );
}
