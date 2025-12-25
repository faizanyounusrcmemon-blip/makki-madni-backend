const express = require("express");
const router = express.Router();
const db = require("../db");

/* ===============================
   CUSTOMER LEDGER
================================ */
router.get("/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;
    let rows = [];
    let balance = 0;

    let customerName = "Customer";
    let bookingDate = new Date();

    /* ===============================
       🔎 FIND CUSTOMER + DATE
    =============================== */

    if (ref_no.startsWith("PKG-")) {
      const q = await db.query(
        `SELECT customer_name, booking_date FROM bookings WHERE ref_no=$1 LIMIT 1`,
        [ref_no]
      );
      if (!q.rows.length)
        return res.json({ success: false, error: "Booking not found" });

      customerName = q.rows[0].customer_name;
      bookingDate = q.rows[0].booking_date;
    }

    else if (ref_no.startsWith("HOT-")) {
      const q = await db.query(
        `SELECT guest_name AS customer_name, booking_date FROM hotels WHERE ref_no=$1 LIMIT 1`,
        [ref_no]
      );
      if (!q.rows.length)
        return res.json({ success: false, error: "Hotel not found" });

      customerName = q.rows[0].customer_name;
      bookingDate = q.rows[0].booking_date;
    }

    else if (ref_no.startsWith("VISA-")) {
      const q = await db.query(
        `SELECT customer_name, visa_date AS booking_date FROM visa WHERE ref_no=$1 LIMIT 1`,
        [ref_no]
      );
      if (!q.rows.length)
        return res.json({ success: false, error: "Visa not found" });

      customerName = q.rows[0].customer_name;
      bookingDate = q.rows[0].booking_date;
    }

    else if (ref_no.startsWith("TRN-")) {
      const q = await db.query(
        `SELECT customer_name, travel_date AS booking_date FROM transport WHERE ref_no=$1 LIMIT 1`,
        [ref_no]
      );
      if (!q.rows.length)
        return res.json({ success: false, error: "Transport not found" });

      customerName = q.rows[0].customer_name;
      bookingDate = q.rows[0].booking_date;
    }

    else if (ref_no.startsWith("TIC-")) {
      const q = await db.query(
        `SELECT passenger_name AS customer_name, booking_date FROM ticketing WHERE ref_no=$1 LIMIT 1`,
        [ref_no]
      );
      if (!q.rows.length)
        return res.json({ success: false, error: "Ticket not found" });

      customerName = q.rows[0].customer_name;
      bookingDate = q.rows[0].booking_date;
    }

    else {
      return res.json({ success: false, error: "Invalid Ref No" });
    }

    /* ===============================
       👤 CUSTOMER ROW
    =============================== */
    rows.push({
      id: "CUSTOMER",
      date: bookingDate,
      description: `Customer: ${customerName}`,
      debit: null,
      credit: null,
      balance: null
    });

    /* ===============================
       💰 SALES (ALL TABLES)
    =============================== */
    const sale = await db.query(
      `
      SELECT SUM(total_pkr) AS amount FROM bookings WHERE ref_no=$1
      UNION ALL
      SELECT SUM(total_pkr) FROM hotels WHERE ref_no=$1
      UNION ALL
      SELECT SUM(total_pkr) FROM visa WHERE ref_no=$1
      UNION ALL
      SELECT SUM(total_pkr) FROM ticketing WHERE ref_no=$1
      UNION ALL
      SELECT SUM(total_pkr) FROM transport WHERE ref_no=$1
      `,
      [ref_no]
    );

    const totalSale = sale.rows.reduce(
      (s, r) => s + Number(r.amount || 0),
      0
    );

    if (totalSale > 0) {
      balance = totalSale;
      rows.push({
        id: "SALE",
        date: bookingDate,
        description: "Sale Entry",
        debit: 0,
        credit: totalSale,
        balance
      });
    }

    /* ===============================
       💵 PAYMENTS
    =============================== */
    const pays = await db.query(
      `
      SELECT id, payment_date, amount, type
      FROM customer_payments
      WHERE ref_no=$1
      ORDER BY payment_date, id
      `,
      [ref_no]
    );

    pays.rows.forEach(p => {
      const amt = Number(p.amount || 0);
      balance -= amt;

      rows.push({
        id: p.id,
        date: p.payment_date,
        description: p.type === "adjustment"
          ? "Adjustment"
          : "Payment Received",
        debit: amt,
        credit: 0,
        balance
      });
    });

    res.json({ success: true, rows });

  } catch (err) {
    console.error("CUSTOMER LEDGER ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* ===============================
   SAVE PAYMENT
================================ */
router.post("/payment", async (req, res) => {
  const { ref_no, amount, payment_method, type, payment_date } = req.body;

  if (!amount || !payment_date)
    return res.json({ success: false, error: "Amount & Date required" });

  await db.query(
    `
    INSERT INTO customer_payments
    (ref_no, amount, payment_method, type, payment_date)
    VALUES ($1,$2,$3,$4,$5)
    `,
    [ref_no, amount, payment_method, type, payment_date]
  );

  res.json({ success: true });
});

/* ===============================
   DELETE ENTRY (PASSWORD)
================================ */
router.delete("/delete/:id", async (req, res) => {
  const { password } = req.body;

  if (password !== "786")
    return res.json({ success: false, error: "Wrong password" });

  await db.query(
    `DELETE FROM customer_payments WHERE id=$1`,
    [req.params.id]
  );

  res.json({ success: true });
});

module.exports = router;

