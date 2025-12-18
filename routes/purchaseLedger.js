const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   PURCHASE LEDGER LOAD (MERGED + RUNNING BALANCE)
===================================================== */
router.get("/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;

    // 1️⃣ MERGED PURCHASE ENTRY (same ref ki sari rows)
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

    // 2️⃣ PAYMENTS + ADJUSTMENTS
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

    // ➕ Purchase debit
    if (purchase.rows[0].total_purchase) {
      balance += Number(purchase.rows[0].total_purchase);

      rows.push({
        id: "PURCHASE",
        created_at: purchase.rows[0].created_at,
        description: "Purchase Entry",
        debit: purchase.rows[0].total_purchase,
        credit: null,
        balance
      });
    }

    // ➖ Payments / Adjustments
    for (const p of payments.rows) {
      balance -= Number(p.amount);

      rows.push({
        id: p.id,
        created_at: p.created_at,
        description:
          p.type === "adjustment"
            ? "Adjustment"
            : `Payment (${p.payment_method})`,
        debit: null,
        credit: p.amount,
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
   PURCHASE PAYMENT / ADJUSTMENT SAVE
===================================================== */
router.post("/payment", async (req, res) => {
  try {
    const {
      ref_no,
      payment_date,
      amount,
      payment_method,
      type
    } = req.body;

    if (!ref_no || !payment_date || !amount) {
      return res.json({
        success: false,
        error: "Amount & Date required"
      });
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
        amount,
        payment_method || "Cash",
        type || "payment" // payment | adjustment
      ]
    );

    return res.json({ success: true });

  } catch (err) {
    console.error("PURCHASE PAYMENT ERROR:", err);
    return res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   PURCHASE LEDGER DELETE (PASSWORD PROTECTED)
===================================================== */
router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (password !== "faizanyounus") {
      return res.json({
        success: false,
        error: "Wrong password"
      });
    }

    const q = await db.query(
      `
      DELETE FROM purchase_payments
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (!q.rows.length) {
      return res.json({
        success: false,
        error: "Entry not found"
      });
    }

    return res.json({
      success: true,
      message: "Entry deleted"
    });

  } catch (err) {
    console.error("PURCHASE DELETE ERROR:", err);
    return res.json({ success: false, error: err.message });
  }
});

module.exports = router;
