const express = require("express");
const router = express.Router();
const db = require("../db");

/* =================================================
   SUPPLIER LEDGER
================================================= */
router.get("/:supplierCode", async (req, res) => {
  try {
    const { supplierCode } = req.params;
    const { from, to } = req.query;

    /* ================= PURCHASE (DEBIT) ================= */
    const purchaseQuery = `
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
    `;

    const purchaseParams = [supplierCode];
    if (from) purchaseParams.push(from);
    if (to) purchaseParams.push(to);

    const purchases = await db.query(purchaseQuery, purchaseParams);

    /* ================= PAYMENTS (CREDIT) ================= */
    const paymentQuery = `
      SELECT
        sp.payment_date AS date,
        'PAYMENT' AS type,
        sp.payment_method,
        0 AS debit,
        sp.amount AS credit
      FROM supplier_payments sp
      JOIN suppliers s ON s.id = sp.supplier_id
      WHERE s.supplier_code = $1
        ${from ? "AND sp.payment_date >= $2" : ""}
        ${to ? `AND sp.payment_date <= $${from ? 3 : 2}` : ""}
    `;

    const paymentParams = [supplierCode];
    if (from) paymentParams.push(from);
    if (to) paymentParams.push(to);

    const payments = await db.query(paymentQuery, paymentParams);

    /* ================= MERGE + BALANCE ================= */
    const ledger = [...purchases.rows, ...payments.rows].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    let balance = 0;
    const finalLedger = ledger.map((r) => {
      balance += Number(r.debit) - Number(r.credit);
      return { ...r, balance };
    });

    /* ================= PENDING / PARTIAL ================= */
    const pendingQuery = `
      SELECT
        pe.ref_no,
        pe.supplier_name,
        CASE
          WHEN SUM(pe.purchase_pkr) >
               COALESCE(SUM(sp.amount),0)
          THEN
            CASE
              WHEN COALESCE(SUM(sp.amount),0) = 0
              THEN 'PENDING'
              ELSE 'PARTIAL'
            END
        END AS status
      FROM purchase_entries pe
      LEFT JOIN suppliers s ON s.supplier_code = pe.supplier_code
      LEFT JOIN supplier_payments sp ON sp.supplier_id = s.id
      WHERE pe.supplier_code = $1
        AND pe.is_deleted = false
      GROUP BY pe.ref_no, pe.supplier_name
      HAVING SUM(pe.purchase_pkr) > COALESCE(SUM(sp.amount),0)
      ORDER BY pe.ref_no DESC
    `;

    const pending = await db.query(pendingQuery, [supplierCode]);

    res.json({
      success: true,
      ledger: finalLedger,
      pending: pending.rows,
    });
  } catch (err) {
    console.error("SUPPLIER LEDGER ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
