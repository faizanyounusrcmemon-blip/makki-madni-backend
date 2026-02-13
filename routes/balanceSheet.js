const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================================
   BALANCE SHEET (CUSTOMER + SUPPLIER STATUS)
========================================= */
router.get("/", async (req, res) => {
  try {

    /* ========== CUSTOMERS ========== */

    // --- Customer Names ---
    const customers = await db.query(`
      SELECT ref_no, MAX(customer_name) AS customer_name FROM (
        SELECT ref_no, customer_name FROM bookings   WHERE is_deleted = false
        UNION ALL
        SELECT ref_no, customer_name FROM ticketing  WHERE is_deleted = false
        UNION ALL
        SELECT ref_no, customer_name FROM hotels     WHERE is_deleted = false
        UNION ALL
        SELECT ref_no, customer_name FROM visa       WHERE is_deleted = false
        UNION ALL
        SELECT ref_no, customer_name FROM transport  WHERE is_deleted = false
        UNION ALL
        SELECT ref_no, customer_name FROM ziyarat    WHERE is_deleted = false
      ) x
      GROUP BY ref_no
    `);

    // --- Sales Total ---
    const sales = await db.query(`
      SELECT ref_no, SUM(total_pkr) AS sale_total FROM (
        SELECT ref_no, total_pkr FROM bookings   WHERE is_deleted = false
        UNION ALL
        SELECT ref_no, total_pkr FROM ticketing  WHERE is_deleted = false
        UNION ALL
        SELECT ref_no, total_pkr FROM hotels     WHERE is_deleted = false
        UNION ALL
        SELECT ref_no, total_pkr FROM visa       WHERE is_deleted = false
        UNION ALL
        SELECT ref_no, total_pkr FROM transport  WHERE is_deleted = false
        UNION ALL
        SELECT ref_no, total_pkr FROM ziyarat    WHERE is_deleted = false
      ) x
      GROUP BY ref_no
    `);

    // --- Customer Payments ---
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

      const saleTotal = Number(s.sale_total);
      const received = Number(paid);
      const balance = saleTotal - received;

      // ✅ CUSTOMER STATUS FIXED
      let status = "PENDING";
      if (balance < 0) status = "EXTRA PAID";
      else if (balance === 0) status = "PAID";
      else if (received > 0) status = "PARTIAL";

      return {
        ref_no: s.ref_no,
        customer_name: cname,
        sale_total: saleTotal,
        received,
        balance,
        status
      };
    });


    /* ========== SUPPLIERS ========== */

    const purchaseTotals = await db.query(`
      SELECT supplier_code, SUM(purchase_pkr) AS purchase_total
      FROM purchase_entries
      WHERE is_deleted = false
      GROUP BY supplier_code
    `);

    const paymentTotals = await db.query(`
      SELECT s.supplier_code, COALESCE(SUM(sp.amount),0) AS paid
      FROM suppliers s
      LEFT JOIN supplier_payments sp 
        ON sp.supplier_id = s.id
      WHERE s.is_deleted = false
      GROUP BY s.supplier_code
    `);

    const suppliersData = await db.query(`
      SELECT supplier_code, supplier_name
      FROM suppliers
      WHERE is_deleted = false
    `);

    const suppliers = suppliersData.rows
      .map(s => {
        const purchase =
          Number(
            purchaseTotals.rows.find(p => p.supplier_code === s.supplier_code)
              ?.purchase_total || 0
          );

        const paid =
          Number(
            paymentTotals.rows.find(p => p.supplier_code === s.supplier_code)
              ?.paid || 0
          );

        const balance = purchase - paid;

        // ✅ SUPPLIER STATUS FIXED
        let status = "PENDING";
        if (balance < 0) status = "EXTRA PAID";
        else if (balance === 0) status = "PAID";
        else if (paid > 0) status = "PARTIAL";

        return {
          supplier_code: s.supplier_code,
          supplier_name: s.supplier_name,
          purchase_total: purchase,
          paid,
          balance,
          status
        };
      })
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));


    /* ========== RESPONSE ========== */

    res.json({
      success: true,

      // ❗ extra paid include — filter remove
      customers: customerRows.sort(
        (a, b) => Math.abs(b.balance) - Math.abs(a.balance)
      ),

      suppliers,

      summary: {
        total_receivable: customerRows
          .filter(r => r.balance > 0)
          .reduce((a, r) => a + r.balance, 0),

        total_payable: suppliers
          .filter(r => r.balance > 0)
          .reduce((a, r) => a + r.balance, 0),

        total_extra_received: customerRows
          .filter(r => r.balance < 0)
          .reduce((a, r) => a + Math.abs(r.balance), 0),

        total_extra_paid: suppliers
          .filter(r => r.balance < 0)
          .reduce((a, r) => a + Math.abs(r.balance), 0)
      }
    });

  } catch (err) {
    console.error("BALANCE SHEET ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
