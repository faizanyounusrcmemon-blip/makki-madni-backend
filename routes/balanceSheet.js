const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================================
   BALANCE SHEET (FINAL — WITH CUSTOMER NAME)
========================================= */
router.get("/", async (req, res) => {
  try {

    /* ===============================
       CUSTOMER NAMES (ALL SALES TABLES)
    =============================== */
    const customers = await db.query(`
      SELECT ref_no, MAX(customer_name) AS customer_name FROM (
        SELECT ref_no, customer_name FROM bookings
        UNION ALL
        SELECT ref_no, customer_name FROM ticketing
        UNION ALL
        SELECT ref_no, customer_name FROM hotels
        UNION ALL
        SELECT ref_no, customer_name FROM visa
        UNION ALL
        SELECT ref_no, customer_name FROM transport
      ) x
      GROUP BY ref_no
    `);

    /* ===============================
       CUSTOMER SALES
    =============================== */
    const sales = await db.query(`
      SELECT ref_no, SUM(amount) AS sale_total FROM (
        SELECT ref_no, total_pkr AS amount FROM bookings
        UNION ALL
        SELECT ref_no, total_pkr FROM ticketing
        UNION ALL
        SELECT ref_no, total_pkr FROM hotels
        UNION ALL
        SELECT ref_no, total_pkr FROM visa
        UNION ALL
        SELECT ref_no, total_pkr FROM transport
      ) x
      GROUP BY ref_no
    `);

    const payments = await db.query(`
      SELECT ref_no, COALESCE(SUM(amount),0) AS received
      FROM customer_payments
      GROUP BY ref_no
    `);

    const customerRows = sales.rows.map(s => {
      const paid =
        payments.rows.find(p => p.ref_no === s.ref_no)?.received || 0;

      const cname =
        customers.rows.find(c => c.ref_no === s.ref_no)?.customer_name || "";

      return {
        ref_no: s.ref_no,
        customer_name: cname,
        sale_total: Number(s.sale_total),
        received: Number(paid),
        balance: Number(s.sale_total) - Number(paid)
      };
    });

    /* ===============================
       PURCHASE PAYABLES
    =============================== */
    const purchases = await db.query(`
      SELECT ref_no, SUM(purchase_pkr) AS purchase_total
      FROM purchase_entries
      GROUP BY ref_no
    `);

    const paid = await db.query(`
      SELECT ref_no, COALESCE(SUM(amount),0) AS paid
      FROM purchase_payments
      GROUP BY ref_no
    `);

    const purchaseRows = purchases.rows.map(p => {
      const paidAmt =
        paid.rows.find(x => x.ref_no === p.ref_no)?.paid || 0;

      const cname =
        customers.rows.find(c => c.ref_no === p.ref_no)?.customer_name || "";

      return {
        ref_no: p.ref_no,
        customer_name: cname,
        purchase_total: Number(p.purchase_total),
        paid: Number(paidAmt),
        balance: Number(p.purchase_total) - Number(paidAmt)
      };
    });

    /* ===============================
       SUMMARY
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
