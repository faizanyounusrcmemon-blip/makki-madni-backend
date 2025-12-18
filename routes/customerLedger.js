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

    // 🔹 MERGED SALES (5 TABLES)
    const sale = await db.query(`
      SELECT MIN(booking_date) AS date, SUM(total_pkr) AS amount FROM bookings WHERE ref_no=$1
      UNION ALL
      SELECT MIN(booking_date), SUM(total_pkr) FROM hotels WHERE ref_no=$1
      UNION ALL
      SELECT MIN(booking_date), SUM(total_pkr) FROM visa WHERE ref_no=$1
      UNION ALL
      SELECT MIN(booking_date), SUM(total_pkr) FROM ticketing WHERE ref_no=$1
      UNION ALL
      SELECT MIN(booking_date), SUM(total_pkr) FROM transport WHERE ref_no=$1
    `, [ref_no]);

    const totalSale = sale.rows.reduce((s, r) => s + Number(r.amount || 0), 0);

    if (totalSale > 0) {
      balance = totalSale;
      rows.push({
        id: "SALE",
        date: sale.rows[0].date,
        description: "Sale Entry",
        debit: 0,
        credit: totalSale,
        balance
      });
    }

    // 🔹 PAYMENTS / ADJUSTMENTS
    const pays = await db.query(`
      SELECT id, payment_date, amount, type
      FROM customer_payments
      WHERE ref_no=$1
      ORDER BY payment_date
    `, [ref_no]);

    pays.rows.forEach(p => {
      balance -= Number(p.amount);
      rows.push({
        id: p.id,
        date: p.payment_date,
        description: p.type === "adjustment" ? "Adjustment" : "Payment Received",
        debit: p.amount,
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

  await db.query(`
    INSERT INTO customer_payments
    (ref_no, amount, payment_method, type, payment_date)
    VALUES ($1,$2,$3,$4,$5)
  `, [ref_no, amount, payment_method, type, payment_date]);

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
