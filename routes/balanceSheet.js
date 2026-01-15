const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================================
   BALANCE SHEET WITH SUPPLIER LEDGER
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
    const suppliers = await db.query(`
      SELECT
        s.supplier_code,
        s.supplier_name,
        COALESCE(SUM(pe.purchase_pkr), 0) AS purchase_total,
        COALESCE(SUM(sp.amount),0) AS paid,
        COALESCE(SUM(pe.purchase_pkr),0) - COALESCE(SUM(sp.amount),0) AS balance,
        CASE 
          WHEN COALESCE(SUM(pe.purchase_pkr),0) - COALESCE(SUM(sp.amount),0) = 0 THEN 'PAID'
          WHEN COALESCE(SUM(sp.amount),0) > 0 THEN 'PARTIAL'
          ELSE 'PENDING'
        END AS status
      FROM suppliers s
      LEFT JOIN purchase_entries pe
        ON pe.supplier_code = s.supplier_code AND pe.is_deleted = false
      LEFT JOIN supplier_payments sp
        ON sp.supplier_id = s.id
      GROUP BY s.supplier_code, s.supplier_name
      ORDER BY balance DESC, s.supplier_name
    `);

    res.json({
      success: true,
      customers: customerRows,
      suppliers: suppliers.rows,
      summary: {
        total_receivable: customerRows.reduce((a,r)=>a+r.balance,0),
        total_payable: suppliers.rows.reduce((a,r)=>a+r.balance,0),
        net_position: customerRows.reduce((a,r)=>a+r.balance,0) -
                      suppliers.rows.reduce((a,r)=>a+r.balance,0)
      }
    });

  } catch(err){
    console.error("BALANCE SHEET ERROR:", err);
    res.json({ success:false, error: err.message });
  }
});

module.exports = router;
