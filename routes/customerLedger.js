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
    let baseDate = new Date();

    const bk = await db.query(
      `
      SELECT customer_name, booking_date
      FROM bookings
      WHERE ref_no=$1
      LIMIT 1
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
      balance: null
    });

    const sale = await db.query(
      `
      SELECT MIN(booking_date) AS date, SUM(total_pkr) AS amount FROM bookings WHERE ref_no=$1
      UNION ALL
      SELECT MIN(booking_date), SUM(total_pkr) FROM hotels WHERE ref_no=$1
      UNION ALL
      SELECT MIN(booking_date), SUM(total_pkr) FROM visa WHERE ref_no=$1
      UNION ALL
      SELECT MIN(booking_date), SUM(total_pkr) FROM ticketing WHERE ref_no=$1
      UNION ALL
      SELECT MIN(booking_date), SUM(total_pkr) FROM transport WHERE ref_no=$1
      `,
      [ref_no]
    );

    const totalSale = sale.rows.reduce(
      (sum, r) => sum + Number(r.amount || 0),
      0
    );

    if (totalSale > 0) {
      balance = totalSale;
      rows.push({
        id: "SALE",
        date: baseDate,
        description: "Sale Entry",
        debit: 0,
        credit: totalSale,
        balance
      });
    }

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
        description: p.type === "adjustment" ? "Adjustment" : "Payment Received",
        debit: amt,
        credit: 0,
        balance
      });
    });

    res.json({ success: true, rows });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ===============================
   SAVE PAYMENT (FINAL)
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
   DELETE ENTRY
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

// ===============================
// PAYMENT SUMMARY (PENDING / PARTIAL)
// ===============================
const totalPaid = pays.rows.reduce(
  (s, p) => s + Number(p.amount || 0),
  0
);

const pending = totalSale - totalPaid;

rows.push({
  id: "SUMMARY",
  date: baseDate,
  description:
    pending > 0 && totalPaid > 0
      ? "Partial Payment"
      : pending > 0
      ? "Pending Payment"
      : "Payment Cleared",
  debit: totalPaid || 0,
  credit: null,
  balance: pending
});


module.exports = router;

