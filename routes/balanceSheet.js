const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================================
   BALANCE SHEET WITH ALL SUPPLIERS
========================================= */
router.get("/", async (req, res) => {
  try {
    // ===== Customers =====
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
        UNION ALL
        SELECT ref_no, customer_name FROM ziyarat
      ) x
      GROUP BY ref_no
    `);

    const sales = await db.query(`
      SELECT ref_no, SUM(total_pkr) AS sale_total FROM (
        SELECT ref_no, total_pkr FROM bookings
        UNION ALL
        SELECT ref_no, total_pkr FROM ticketing
        UNION ALL
        SELECT ref_no, total_pkr FROM hotels
        UNION ALL
        SELECT ref_no, total_pkr FROM visa
        UNION ALL
        SELECT ref_no, total_pkr FROM transport
        UNION ALL
        SELECT ref_no, total_pkr FROM ziyarat
      ) x
      GROUP BY ref_no
    `);

    const payments = await db.query(`
      SELECT ref_no, COALESCE(SUM(amount),0) AS received
      FROM customer_payments
      GROUP BY ref_no
    `);

    const customerRows = sales.rows.map(s => {
      const paid = payments.rows.find(p => p.ref_no === s.ref_no)?.received || 0;
      const cname = customers.rows.find(c => c.ref_no === s.ref_no)?.customer_name || "";
      return {
        ref_no: s.ref_no,
        customer_name: cname,
        sale_total: Number(s.sale_total),
        received: Number(paid),
        balance: Number(s.sale_total) - Number(paid)
      };
    });

    // ===== Suppliers =====
    // Step 1: total purchase per supplier
    const purchaseTotals = await db.query(`
      SELECT supplier_code, SUM(purchase_pkr) AS purchase_total
      FROM purchase_entries
      WHERE is_deleted = false
      GROUP BY supplier_code
    `);

    // Step 2: total payments per supplier
    const paymentTotals = await db.query(`
      SELECT s.supplier_code, COALESCE(SUM(sp.amount),0) AS paid
      FROM suppliers s
      LEFT JOIN supplier_payments sp ON sp.supplier_id = s.id
      GROUP BY s.supplier_code
    `);

    // Step 3: merge suppliers
    const suppliersData = await db.query(`
      SELECT supplier_code, supplier_name FROM suppliers
    `);

    const suppliers = suppliersData.rows.map(s => {
      const purchase = Number(purchaseTotals.rows.find(p => p.supplier_code === s.supplier_code)?.purchase_total || 0);
      const paid = Number(paymentTotals.rows.find(p => p.supplier_code === s.supplier_code)?.paid || 0);
      const balance = purchase - paid;
      const status = balance === 0 ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";
      return { ...s, purchase_total: purchase, paid, balance, status };
    }).filter(s => s.balance > 0) // optional: hide zero balance
      .sort((a,b) => b.balance - a.balance); // highest balance top

    res.json({
      success: true,
      customers: customerRows.filter(c=>c.balance>0).sort((a,b)=>b.balance - a.balance),
      suppliers,
      summary: {
        total_receivable: customerRows.reduce((a,r)=>a+r.balance,0),
        total_payable: suppliers.reduce((a,r)=>a+r.balance,0),
        net_position: customerRows.reduce((a,r)=>a+r.balance,0) - suppliers.reduce((a,r)=>a+r.balance,0)
      }
    });

  } catch(err){
    console.error("BALANCE SHEET ERROR:", err);
    res.json({ success:false, error: err.message });
  }
});

module.exports = router;
