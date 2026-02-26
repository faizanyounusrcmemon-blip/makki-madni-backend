const express = require("express");
const router = express.Router();
const db = require("../db");

/* ===============================
   CUSTOMER LEDGER (DETAIL)
================================ */
router.get("/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;
    let rows = [];
    let balance = 0;

    let customerName = "Customer";
    let baseDate = new Date();

    const bk = await db.query(
      `
      SELECT customer_name, booking_date
      FROM bookings
      WHERE ref_no=$1 AND is_deleted=false
      
      UNION ALL
      SELECT customer_name, booking_date
      FROM hotels
      WHERE ref_no=$1 AND is_deleted=false

      UNION ALL
      SELECT customer_name, booking_date
      FROM visa
      WHERE ref_no=$1 AND is_deleted=false

      UNION ALL
      SELECT customer_name, booking_date
      FROM card
      WHERE ref_no=$1 AND is_deleted=false


      UNION ALL
      SELECT customer_name, booking_date
      FROM ticketing
      WHERE ref_no=$1 AND is_deleted=false


      UNION ALL
      SELECT customer_name, booking_date
      FROM transport
      WHERE ref_no=$1 AND is_deleted=false


      UNION ALL
      SELECT customer_name, booking_date
      FROM ziyarat
      WHERE ref_no=$1 AND is_deleted=false
      `,
      [ref_no]
    );

    if (bk.rows.length) {
      customerName = bk.rows[0].customer_name;
      baseDate = bk.rows[0].booking_date;
    }

    rows.push({
      id: "CUSTOMER",
      date: baseDate,
      description: `Customer: ${customerName}`,
      debit: null,
      credit: null,
      balance: null,
    });

    /* =========================
       TOTAL SALE (STANDARD)
    ========================= */
    const sale = await db.query(
      `
      SELECT SUM(total_pkr) AS amount FROM bookings WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM hotels WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM visa WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM card WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM ticketing WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM transport WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM ziyarat WHERE ref_no=$1 AND is_deleted=false
      `,
      [ref_no]
    );

    const totalSale = Math.round(
      sale.rows.reduce((sum, r) => sum + Number(r.amount || 0), 0)
    );

    if (totalSale > 0) {
      balance = totalSale;
      rows.push({
        id: "SALE",
        date: baseDate,
        description: "Sale Entry",
        debit: 0,
        credit: totalSale,
        balance,
      });
    }

    /* =========================
       PAYMENTS
    ========================= */
    const pays = await db.query(
      `
      SELECT id, payment_date, amount, type
      FROM customer_payments
      WHERE ref_no=$1
      ORDER BY payment_date, id
      `,
      [ref_no]
    );

    pays.rows.forEach((p) => {
      const amt = Math.round(Number(p.amount || 0));
      balance -= amt;

      rows.push({
        id: p.id,
        date: p.payment_date,
        description:
          p.type === "adjustment"
            ? "Adjustment"
            : "Payment Received",
        debit: amt,
        credit: 0,
        balance,
      });
    });

    res.json({ success: true, rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   ✅ PENDING / PARTIAL LEDGER LIST (WITH CUSTOMER NAME)
   ❌ DELETED DATA EXCLUDED
===================================================== */
router.get("/pending/list", async (req, res) => {
  try {
    // 🔹 total sale + customer name
    const sales = await db.query(`
      SELECT
        ref_no,
        MAX(customer_name) AS customer_name,
        SUM(total_pkr) AS total_sale
      FROM (
        SELECT ref_no, customer_name, total_pkr
        FROM bookings
        WHERE is_deleted=false

        UNION ALL
        SELECT ref_no, customer_name, total_pkr
        FROM hotels
        WHERE is_deleted=false

        UNION ALL
        SELECT ref_no, customer_name, total_pkr
        FROM visa
        WHERE is_deleted=false

        UNION ALL
        SELECT ref_no, customer_name, total_pkr
        FROM card
        WHERE is_deleted=false

        UNION ALL
        SELECT ref_no, customer_name, total_pkr
        FROM ticketing
        WHERE is_deleted=false

        UNION ALL
        SELECT ref_no, customer_name, total_pkr
        FROM transport
        WHERE is_deleted=false

        UNION ALL
        SELECT ref_no, customer_name, total_pkr
        FROM ziyarat
        WHERE is_deleted=false
      ) x
      GROUP BY ref_no
    `);

    // 🔹 payments
    const pays = await db.query(`
      SELECT ref_no, SUM(amount) AS paid
      FROM customer_payments
      GROUP BY ref_no
    `);

    const paidMap = {};
    pays.rows.forEach((p) => {
      paidMap[p.ref_no] = Math.round(Number(p.paid || 0));
    });

    const result = [];

    for (const r of sales.rows) {
      const totalSale = Math.round(Number(r.total_sale || 0));
      const totalPaid = paidMap[r.ref_no] || 0;

      if (totalSale <= 0) continue;          // 🔒 safety
      if (totalPaid >= totalSale) continue; // ✅ cleared hide

      result.push({
        ref_no: r.ref_no,
        customer_name: r.customer_name || "",
        status: totalPaid > 0 ? "PARTIAL" : "PENDING",
        note:
          totalPaid > 0
            ? "Payment partially received"
            : "Payment not received",
      });
    }

    res.json({ success: true, rows: result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ===============================
   SAVE PAYMENT
================================ */
router.post("/payment", async (req, res) => {
  try {
    const { ref_no, amount, payment_method, type, payment_date } = req.body;

    if (!ref_no)
      return res.json({ success: false, error: "Ref No required" });
    if (!amount || Number(amount) <= 0)
      return res.json({ success: false, error: "Invalid amount" });
    if (!payment_date)
      return res.json({ success: false, error: "Date required" });

    await db.query(
      `
      INSERT INTO customer_payments
      (ref_no, amount, payment_method, type, payment_date)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [ref_no, amount, payment_method, type, payment_date]
    );

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ===============================
   DELETE PAYMENT
================================ */
router.delete("/delete/:id", async (req, res) => {
  const { password } = req.body;

  if (password !== "786")
    return res.json({ success: false, error: "Wrong password" });

  await db.query(`DELETE FROM customer_payments WHERE id=$1`, [
    req.params.id,
  ]);

  res.json({ success: true });
});

module.exports = router;




