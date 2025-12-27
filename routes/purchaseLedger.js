const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   PURCHASE LEDGER LOAD (NO DECIMAL)
===================================================== */
router.get("/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;

    // PURCHASE TOTAL
    const purchase = await db.query(
      `
      SELECT
        MIN(created_at) AS created_at,
        SUM(purchase_pkr) AS total_purchase
      FROM purchase_entries
      WHERE ref_no = $1 AND is_deleted = false
      `,
      [ref_no]
    );

    // PAYMENTS
    const payments = await db.query(
      `
      SELECT
        id,
        payment_date AS created_at,
        amount,
        payment_method,
        type
      FROM purchase_payments
      WHERE ref_no = $1
      ORDER BY payment_date, id
      `,
      [ref_no]
    );

    let rows = [];
    let balance = 0;

    // ➕ PURCHASE ENTRY (INTEGER)
    if (purchase.rows[0].total_purchase) {
      const amt = Math.round(Number(purchase.rows[0].total_purchase));
      balance += amt;

      rows.push({
        id: "PURCHASE",
        created_at: purchase.rows[0].created_at,
        description: "Purchase Entry",
        debit: amt,
        credit: null,
        balance
      });
    }

    // ➖ PAYMENTS / ADJUSTMENTS (INTEGER)
    for (const p of payments.rows) {
      const amt = Math.round(Number(p.amount || 0));
      balance -= amt;

      rows.push({
        id: p.id,
        created_at: p.created_at,
        description:
          p.type === "adjustment"
            ? "Adjustment"
            : `Payment (${p.payment_method})`,
        debit: null,
        credit: amt,
        balance
      });
    }

    return res.json({ success: true, rows });

  } catch (err) {
    console.error("PURCHASE LEDGER ERROR:", err);
    return res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   PENDING / PARTIAL PURCHASE LIST (LIKE CUSTOMER LEDGER)
===================================================== */
router.get("/pending/list", async (req, res) => {
  try {
    const purchase = await db.query(`
      SELECT ref_no, SUM(purchase_pkr) AS total_purchase
      FROM purchase_entries
      WHERE is_deleted = false
      GROUP BY ref_no
    `);

    const pay = await db.query(`
      SELECT ref_no, SUM(amount) AS paid
      FROM purchase_payments
      GROUP BY ref_no
    `);

    const payMap = {};
    pay.rows.forEach(p => {
      payMap[p.ref_no] = Math.round(Number(p.paid || 0));
    });

    const rows = [];

    for (const r of purchase.rows) {
      const total = Math.round(Number(r.total_purchase || 0));
      const paid = payMap[r.ref_no] || 0;

      if (paid >= total) continue; // ✅ CLEARED HIDE

      rows.push({
        ref_no: r.ref_no,
        status: paid > 0 ? "PARTIAL" : "PENDING",
        note: paid > 0
          ? "Payment partially made"
          : "Payment not made"
      });
    }

    res.json({ success: true, rows });

  } catch (err) {
    console.error("PURCHASE PENDING ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   SAVE PAYMENT / ADJUSTMENT (NO DECIMAL)
===================================================== */
router.post("/payment", async (req, res) => {
  try {
    const { ref_no, payment_date, amount, payment_method, type } = req.body;

    if (!ref_no || !payment_date || !amount) {
      return res.json({ success: false, error: "Amount & Date required" });
    }

    await db.query(
      `
      INSERT INTO purchase_payments
      (ref_no, payment_date, amount, payment_method, type)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [
        ref_no,
        payment_date,
        Math.round(Number(amount)),
        payment_method || "Cash",
        type || "payment"
      ]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("PURCHASE PAYMENT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   DELETE PAYMENT
===================================================== */
router.delete("/delete/:id", async (req, res) => {
  const { password } = req.body;

  if (password !== "786") {
    return res.json({ success: false, error: "Wrong password" });
  }

  await db.query(`DELETE FROM purchase_payments WHERE id=$1`, [
    req.params.id
  ]);

  res.json({ success: true });
});

module.exports = router;
