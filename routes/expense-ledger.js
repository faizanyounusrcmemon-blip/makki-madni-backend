const express = require("express");
const router = express.Router();
const db = require("../db");

/* ================= LIST ================= */
router.get("/", async (req, res) => {
  try {
    const r = await db.query(
      "SELECT * FROM expense_ledger ORDER BY expense_date DESC, id DESC"
    );
    res.json({ success: true, rows: r.rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ================= ADD ================= */
router.post("/add", async (req, res) => {
  const { expense_date, title, amount, remarks, payment_method } = req.body;

  if (!expense_date || !title || !amount || !payment_method)
    return res.json({ success: false, error: "Missing fields" });

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `
      INSERT INTO expense_ledger
      (expense_date, title, amount, remarks, payment_method)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id
      `,
      [expense_date, title, amount, remarks || "", payment_method]
    );

    const expenseId = r.rows[0].id;

    // 🔹 BANK → auto withdraw
    if (payment_method === "Bank") {
      await client.query(
        `
        INSERT INTO bank_transactions
        (txn_date, type, amount, comment, source, ref_id)
        VALUES ($1,'withdraw',$2,$3,'expense',$4)
        `,
        [expense_date, amount, `Expense: ${title}`, expenseId]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

/* ================= DELETE ================= */
router.delete("/delete/:id", async (req, res) => {
  const { password } = req.body;
  if (password !== "786")
    return res.json({ success: false, error: "Wrong password" });

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(
      "SELECT payment_method FROM expense_ledger WHERE id=$1",
      [req.params.id]
    );

    ifrow;
    if (r.rows.length === 0)
      throw new Error("Expense not found");

    // 🔹 auto delete bank ledger
    if (r.rows[0].payment_method === "Bank") {
      await client.query(
        "DELETE FROM bank_transactions WHERE source='expense' AND ref_id=$1",
        [req.params.id]
      );
    }

    await client.query(
      "DELETE FROM expense_ledger WHERE id=$1",
      [req.params.id]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
