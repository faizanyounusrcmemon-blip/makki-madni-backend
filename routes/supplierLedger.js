const express = require("express");
const router = express.Router();
const db = require("../db");

/* ==========================
   GET LEDGER BY SUPPLIER CODE
========================== */
router.get("/:supplierCode", async (req, res) => {
  try {
    const { supplierCode } = req.params;

    const supplier = await db.query(
      "SELECT id, supplier_name, supplier_code FROM suppliers WHERE supplier_code = $1",
      [supplierCode]
    );
    if (!supplier.rows.length) return res.json({ success: false, error: "Supplier not found" });

    const supplierId = supplier.rows[0].id;

    // PURCHASES (DEBIT)
    const purchases = await db.query(
      `SELECT pe.created_at::date AS date,
              'PURCHASE' AS type,
              '-' AS payment_method,
              SUM(pe.purchase_pkr) AS debit,
              0 AS credit,
              s.supplier_code,
              s.supplier_name,
              SUM(pe.purchase_pkr) - COALESCE(SUM(sp.amount),0) AS pending_amount
       FROM purchase_entries pe
       JOIN suppliers s ON s.supplier_code = pe.supplier_code
       LEFT JOIN supplier_payments sp
         ON sp.supplier_id = s.id
       WHERE pe.supplier_code = $1
         AND pe.is_deleted = false
       GROUP BY pe.created_at::date, s.supplier_code, s.supplier_name
       ORDER BY pe.created_at::date`,
      [supplierCode]
    );

    // PAYMENTS (CREDIT)
    const payments = await db.query(
      `SELECT sp.payment_date AS date,
              'PAYMENT' AS type,
              sp.payment_method,
              0 AS debit,
              sp.amount AS credit,
              s.supplier_code,
              s.supplier_name
       FROM supplier_payments sp
       JOIN suppliers s ON s.id = sp.supplier_id
       WHERE sp.supplier_id = $1
       ORDER BY sp.payment_date`,
      [supplierId]
    );

    // MERGE + BALANCE CALCULATION
    const ledgerAll = [...purchases.rows, ...payments.rows].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    let balance = 0;
    const finalLedger = ledgerAll.map(r => {
      balance += Number(r.debit || 0) - Number(r.credit || 0);
      return { ...r, balance };
    });

    // PENDING LIST (always visible)
    const pending = purchases.rows.map(r => ({
      supplier_code: r.supplier_code,
      supplier_name: r.supplier_name,
      status: r.pending_amount > 0 ? "PENDING" : "PAID"
    }));

    res.json({ success: true, ledger: finalLedger, pending });

  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ==========================
   SAVE PAYMENT / ADJUSTMENT
========================== */
router.post("/payment", async (req, res) => {
  try {
    const { supplier_code, payment_date, payment_method, amount, type } = req.body;
    const supplier = await db.query(
      "SELECT id FROM suppliers WHERE supplier_code = $1",
      [supplier_code]
    );
    if (!supplier.rows.length) return res.json({ success: false, error: "Supplier not found" });

    await db.query(
      `INSERT INTO supplier_payments (supplier_id, payment_date, payment_method, amount, type)
       VALUES ($1,$2,$3,$4,$5)`,
      [supplier.rows[0].id, payment_date, payment_method, amount, type]
    );

    res.json({ success: true });

  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ==========================
   GET ALL PENDING (always visible)
========================== */
router.get("/pending", async (req, res) => {
  try {
    const pending = await db.query(
      `SELECT s.supplier_code, s.supplier_name,
              SUM(pe.purchase_pkr) - COALESCE(SUM(sp.amount),0) AS pending_amount,
              CASE WHEN SUM(pe.purchase_pkr) - COALESCE(SUM(sp.amount),0) > 0 THEN 'PENDING' ELSE 'PAID' END AS status
       FROM purchase_entries pe
       JOIN suppliers s ON s.supplier_code = pe.supplier_code
       LEFT JOIN supplier_payments sp
         ON sp.supplier_id = s.id
       WHERE pe.is_deleted=false
       GROUP BY s.supplier_code, s.supplier_name
       ORDER BY s.supplier_name`
    );

    res.json({ success: true, pending: pending.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
