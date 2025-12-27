const express = require("express");
const router = express.Router();
const db = require("../db");

/* ===============================
   CUSTOMER LEDGER (FINAL FIXED)
================================ */
router.get("/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;

    let rows = [];
    let balance = 0;

    // =========================
    // CUSTOMER INFO
    // =========================
    let customerName = "Customer";
    let baseDate = new Date();

    const bk = await db.query(
      `
      SELECT customer_name, booking_date
      FROM bookings
      WHERE ref_no = $1
      LIMIT 1
      `,
      [ref_no]
    );

    if (bk.rows.length > 0) {
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

    // =========================
    // TOTAL SALE (ALL MODULES)
    // =========================
    const sale = await db.query(
      `
      SELECT SUM(total_pkr) AS amount FROM bookings WHERE ref_no=$1
      UNION ALL SELECT SUM(total_pkr) FROM hotels WHERE ref_no=$1
      UNION ALL SELECT SUM(total_pkr) FROM visa WHERE ref_no=$1
      UNION ALL SELECT SUM(total_pkr) FROM ticketing WHERE ref_no=$1
      UNION ALL SELECT SUM(total_pkr) FROM transport WHERE ref_no=$1
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
        balance,
      });
    }

    // =========================
    // PAYMENTS (DEFINE FIRST ✅)
    // =========================
    const pays = await db.query(
      `
      SELECT id, payment_date, amount, type
      FROM customer_payments
      WHERE ref_no=$1
      ORDER BY payment_date, id
      `,
      [ref_no]
    );

    const totalPaid = pays.rows.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    const pending = totalSale - totalPaid;

    // =========================
    // 🔥 SUMMARY ROW (TOP)
    // =========================
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
      balance: pending,
    });

    // =========================
    // PAYMENT ROWS
    // =========================
    pays.rows.forEach((p) => {
      const amt = Number(p.amount || 0);
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

    return res.json({ success: true, rows });
  } catch (err) {
    console.error("CUSTOMER LEDGER ERROR:", err);
    return res.json({ success: false, error: err.message });
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

    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

/* ===============================
   DELETE PAYMENT
================================ */
router.delete("/delete/:id", async (req, res) => {
  const { password } = req.body;

  if (password !== "786") {
    return res.json({ success: false, error: "Wrong password" });
  }

  await db.query(
    `DELETE FROM customer_payments WHERE id=$1`,
    [req.params.id]
  );

  return res.json({ success: true });
});

module.exports = router;
