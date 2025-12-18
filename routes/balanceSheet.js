const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================================
   BALANCE SHEET (FINAL)
========================================= */
router.get("/", async (req, res) => {
  try {

    /* ===============================
       CUSTOMER RECEIVABLES
    =============================== */
    const customers = await db.query(`
      SELECT
        b.ref_no,
        b.total_pkr AS sale_total,
        COALESCE(SUM(cp.amount),0) AS received
      FROM bookings b
      LEFT JOIN customer_payments cp
        ON cp.ref_no = b.ref_no
      GROUP BY b.ref_no, b.total_pkr
      ORDER BY b.ref_no
    `);

    const customerRows = customers.rows.map(r => ({
      ref_no: r.ref_no,
      sale_total: Number(r.sale_total),
      received: Number(r.received),
      balance: Number(r.sale_total) - Number(r.received)
    }));

    /* ===============================
       PURCHASE PAYABLES
    =============================== */
    const purchases = await db.query(`
      SELECT
        pe.ref_no,
        SUM(pe.purchase_pkr) AS purchase_total,
        COALESCE(SUM(pp.amount),0) AS paid
      FROM purchase_entries pe
      LEFT JOIN purchase_payments pp
        ON pp.ref_no = pe.ref_no
      GROUP BY pe.ref_no
      ORDER BY pe.ref_no
    `);

    const purchaseRows = purchases.rows.map(r => ({
      ref_no: r.ref_no,
      purchase_total: Number(r.purchase_total),
      paid: Number(r.paid),
      balance: Number(r.purchase_total) - Number(r.paid)
    }));

    /* ===============================
       TOTALS
    =============================== */
    const totalReceivable = customerRows.reduce((s,r)=>s+r.balance,0);
    const totalPayable = purchaseRows.reduce((s,r)=>s+r.balance,0);

    res.json({
      success: true,
      customers: customerRows,
      purchases: purchaseRows,
      summary: {
        total_receivable: totalReceivable,
        total_payable: totalPayable,
        net_position: totalReceivable - totalPayable
      }
    });

  } catch (err) {
    console.error("BALANCE SHEET ERROR:", err);
    res.json({ success:false, error: err.message });
  }
});

module.exports = router;
