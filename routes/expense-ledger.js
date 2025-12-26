const express = require("express");
const router = express.Router();
const db = require("../db");

/* ================= LIST ================= */
router.get("/", async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM expense_ledger ORDER BY expense_date DESC, id DESC`
    );
    res.json({ success: true, rows: r.rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ================= ADD ================= */
router.post("/add", async (req, res) => {
  try {
    const { expense_date, title, amount, remarks, payment_method } = req.body;

    if (!expense_date || !title || !amount || !payment_method)
      return res.json({ success: false, error: "Missing fields" });

    // 1️⃣ save expense
    const r = await db.query(
      `
      INSERT INTO expense_ledger
        (expense_date, title, amount, remarks, payment_method)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id
      `,
      [expense_date, title, amount, remarks || "", payment_method]
    );

    const expenseId = r.rows[0].id;

    // 2️⃣ if BANK → minus from bank ledger
    if (payment_method === "Bank") {
      await db.query(
        `
        INSERT INTO bank_transactions
          (txn_date, type, amount, comment)
        VALUES ($1,'withdraw',$2,$3)
        `,
        [
          expense_date,
          amount,
          `Expense: ${title} (ID:${expenseId})`,
        ]
      );
    }

    res.json({ success: true, message: "Expense saved" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ================= DELETE ================= */
router.delete("/delete/:id", async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== "786")
      return res.json({ success: false, error: "Wrong password" });

    // get expense first
    const r = await db.query(
      `SELECT * FROM expense_ledger WHERE id=$1`,
      [req.params.id]
    );

    if (r.rows.length === 0)
      return res.json({ success: false, error: "Not found" });

    const exp = r.rows[0];

    // delete expense
    await db.query(
      `DELETE FROM expense_ledger WHERE id=$1`,
      [req.params.id]
    );

    // if bank → delete linked bank transaction
    if (exp.payment_method === "Bank") {
      await db.query(
        `
        DELETE FROM bank_transactions
        WHERE comment = $1
        `,
        [`Expense: ${exp.title} (ID:${exp.id})`]
      );
    }

    res.json({ success: true, message: "Expense deleted" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
