const express = require("express");
const router = express.Router();
const db = require("../db");

/* ---------- GET LEDGER ---------- */
router.get("/:supplierCode", async (req, res) => {
  try {
    const { supplierCode } = req.params;

    // ✅ Get Supplier
    const supplierRes = await db.query(
      "SELECT id, supplier_name FROM suppliers WHERE supplier_code = $1",
      [supplierCode]
    );
    if (!supplierRes.rows.length)
      return res.json({ success: false, error: "Supplier not found" });
    const supplierId = supplierRes.rows[0].id;

    // ✅ PURCHASES (DEBIT)
    const purchases = await db.query(
      `SELECT 
         pe.created_at::date AS date,
         'PURCHASE' AS type,
         '-' AS payment_method,
         SUM(pe.purchase_pkr) AS debit,
         0 AS credit,
         pe.ref_no,
         pe.supplier_name,
         SUM(pe.purchase_pkr) - COALESCE(SUM(sp.amount),0) AS pending_amount
       FROM purchase_entries pe
       LEFT JOIN supplier_payments sp
         ON sp.supplier_id = $2
       WHERE pe.supplier_code = $1
         AND pe.is_deleted = false
       GROUP BY pe.created_at::date, pe.ref_no, pe.supplier_name
       ORDER BY pe.created_at::date`,
      [supplierCode, supplierId]
    );

    // ✅ PAYMENTS & ADJUSTMENTS (CREDIT)
    const payments = await db.query(
      `SELECT 
         payment_date AS date,
         type,
         payment_method,
         0 AS debit,
         amount AS credit
       FROM supplier_payments
       WHERE supplier_id = $1
       ORDER BY payment_date`,
      [supplierId]
    );

    // ✅ MERGE + CALCULATE BALANCE
    const ledgerAll = [...purchases.rows, ...payments.rows].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
    let balance = 0;
    const finalLedger = ledgerAll.map(r => {
      balance += Number(r.debit || 0) - Number(r.credit || 0);
      return { ...r, balance };
    });

    // ✅ PENDING LIST (always show)
    const pending = purchases.rows
      .map(r => ({
        ref_no: r.ref_no,
        supplier_name: r.supplier_name,
        status: r.pending_amount > 0 ? "PENDING" : "PAID"
      }))
      .filter(r => r.status === "PENDING");

    res.json({ success: true, ledger: finalLedger, pending });

  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- SAVE PAYMENT / ADJUSTMENT ---------- */
router.post("/payment", async (req, res) => {
  try {
    const { supplier_code, payment_date, payment_method, amount, type } = req.body;

    // ✅ Get Supplier
    const supplier = await db.query(
      "SELECT id FROM suppliers WHERE supplier_code = $1",
      [supplier_code]
    );
    if (!supplier.rows.length)
      return res.json({ success: false, error: "Supplier not found" });

    // ✅ Insert Payment / Adjustment
    await db.query(
      `INSERT INTO supplier_payments 
         (supplier_id, payment_date, payment_method, amount, type)
       VALUES ($1,$2,$3,$4,$5)`,
      [supplier.rows[0].id, payment_date, payment_method, amount, type]
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- PENDING LIST ALWAYS ---------- */
router.get("/pending/list", async (req, res) => {
  try {
    const pendingRes = await db.query(
      `SELECT pe.ref_no, pe.supplier_name, SUM(pe.purchase_pkr) - COALESCE(SUM(sp.amount),0) AS pending_amount
       FROM purchase_entries pe
       LEFT JOIN supplier_payments sp
         ON sp.supplier_id = pe.supplier_id
       WHERE pe.is_deleted = false
       GROUP BY pe.ref_no, pe.supplier_name
       HAVING SUM(pe.purchase_pkr) - COALESCE(SUM(sp.amount),0) > 0
       ORDER BY pe.ref_no DESC`
    );
    const pending = pendingRes.rows.map(r => ({
      ref_no: r.ref_no,
      supplier_name: r.supplier_name,
      status: "PENDING"
    }));
    res.json({ success: true, pending });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
