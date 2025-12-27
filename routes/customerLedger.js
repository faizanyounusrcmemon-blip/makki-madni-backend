const express = require("express");
const router = express.Router();
const db = require("../db");

/* ===============================
   CUSTOMER LEDGER (FINAL)
================================ */
router.get("/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;

    let rows = [];
    let balance = 0;

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
      (s, r) => s + Number(r.amount || 0),
      0
    );

    // =========================
    // PAYMENTS
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
      (s, p) => s + Number(p.amount || 0),
      0
    );

    const pending = totalSale - totalPaid;

    // =========================
    // LEDGER TABLE ROWS
    // =========================
    balance = totalSale;

    if (totalSale > 0) {
      rows.push({
        id: "SALE",
        date: new Date(),
        description: "Sale Entry",
        debit: 0,
        credit: totalSale,
        balance,
      });
    }

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

    // =========================
    // SUMMARY LIST (ONLY IF NOT CLEARED)
    // =========================
    let summary = null;

    if (pending > 0) {
      summary = {
        totalSale,
        totalPaid,
        pending,
        status:
          totalPaid > 0 ? "PARTIAL PAYMENT" : "FULL PENDING",
      };
    }

    return res.json({
      success: true,
      summary,
      rows,
    });
  } catch (err) {
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

  if (password !== "786")
    return res.json({ success: false, error: "Wrong password" });

  await db.query(`DELETE FROM customer_payments WHERE id=$1`, [
    req.params.id,
  ]);

  return res.json({ success: true });
});

module.exports = router;
