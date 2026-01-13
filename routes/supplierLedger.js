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
        purchase_date AS date,
        'PURCHASE' AS type,
        'Purchase' AS payment_method,
        total_amount AS debit,
        0 AS credit
      FROM purchase_list
      WHERE supplier_code = $1
      ${from ? "AND purchase_date >= $2" : ""}
      ${to ? `AND purchase_date <= $${from ? 3 : 2}` : ""}
    `;

    const purchaseParams = [supplierCode];
    if (from) purchaseParams.push(from);
    if (to) purchaseParams.push(to);

    const purchases = await db.query(purchaseQuery, purchaseParams);

    /* ================= PAYMENTS (CREDIT) ================= */
    const paymentQuery = `
      SELECT 
        payment_date AS date,
        'PAYMENT' AS type,
        payment_method,
        0 AS debit,
        amount AS credit
      FROM purchase_payments
      WHERE supplier_code = $1
      ${from ? "AND payment_date >= $2" : ""}
      ${to ? `AND payment_date <= $${from ? 3 : 2}` : ""}
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

    /* ================= PENDING PURCHASES ================= */
    const pending = await db.query(
      `
      SELECT ref_no, supplier_name, status
      FROM purchase_list
      WHERE supplier_code = $1
        AND status IN ('PENDING','PARTIAL')
      ORDER BY purchase_date DESC
    `,
      [supplierCode]
    );

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
