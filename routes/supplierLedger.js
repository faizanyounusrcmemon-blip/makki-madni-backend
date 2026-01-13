const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================================
   SUPPLIER LEDGER + PAYMENT ENTRY
========================================= */

/* ---------- GET LEDGER ---------- */
router.get("/:supplierCode", async (req, res) => {
  try {
    const { supplierCode } = req.params;
    const { from, to } = req.query;

    const supplier = await db.query(
      "SELECT id, supplier_name FROM suppliers WHERE supplier_code = $1",
      [supplierCode]
    );

    if (!supplier.rows.length) {
      return res.json({ success: false, error: "Supplier not found" });
    }

    const supplierId = supplier.rows[0].id;

    /* ===== PURCHASE (DEBIT) ===== */
    const purchases = await db.query(
      `
      SELECT
        pe.created_at::date AS date,
        'PURCHASE' AS type,
        '-' AS payment_method,
        SUM(pe.purchase_pkr) AS debit,
        0 AS credit
      FROM purchase_entries pe
      WHERE pe.supplier_code = $1
        AND pe.is_deleted = false
        ${from ? "AND pe.created_at::date >= $2" : ""}
        ${to ? `AND pe.created_at::date <= $${from ? 3 : 2}` : ""}
      GROUP BY pe.created_at::date
      `,
      from && to
        ? [supplierCode, from, to]
        : from
        ? [supplierCode, from]
        : [supplierCode]
    );

    /* ===== PAYMENTS (CREDIT) ===== */
    const payments = await db.query(
      `
      SELECT
        payment_date AS date,
        'PAYMENT' AS type,
        payment_method,
        0 AS debit,
        amount AS credit
      FROM supplier_payments
      WHERE supplier_id = $1
        ${from ? "AND payment_date >= $2" : ""}
        ${to ? `AND payment_date <= $${from ? 3 : 2}` : ""}
      `,
      from && to
        ? [supplierId, from, to]
        : from
        ? [supplierId, from]
        : [supplierId]
    );

    /* ===== MERGE + BALANCE ===== */
    const ledger = [...purchases.rows, ...payments.rows].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    let balance = 0;
    const finalLedger = ledger.map((r) => {
      balance += Number(r.debit) - Number(r.credit);
      return { ...r, balance };
    });

    /* ===== PENDING / PARTIAL ===== */
    const pending = await db.query(
      `
      SELECT DISTINCT ref_no, supplier_name, status
      FROM purchase_entries
      WHERE supplier_code = $1
        AND status IN ('PENDING','PARTIAL')
      ORDER BY ref_no DESC
      `,
      [supplierCode]
    );

    res.json({
      success: true,
      supplier: supplier.rows[0],
      ledger: finalLedger,
      pending: pending.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- SAVE PAYMENT ---------- */
router.post("/payment", async (req, res) => {
  try {
    const { supplier_code, payment_date, payment_method, amount } = req.body;

    const supplier = await db.query(
      "SELECT id FROM suppliers WHERE supplier_code = $1",
      [supplier_code]
    );

    if (!supplier.rows.length) {
      return res.json({ success: false, error: "Supplier not found" });
    }

    await db.query(
      `
      INSERT INTO supplier_payments
      (supplier_id, payment_date, payment_method, amount)
      VALUES ($1,$2,$3,$4)
      `,
      [
        supplier.rows[0].id,
        payment_date,
        payment_method,
        amount,
      ]
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
