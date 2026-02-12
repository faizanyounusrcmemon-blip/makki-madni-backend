const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================
   AUTO SUPPLIER CODE
===================================== */
const genCode = async () => {
  const r = await db.query(
    `SELECT COUNT(*) FROM suppliers`
  );
  const n = Number(r.rows[0].count) + 1;
  return `SUP-${String(n).padStart(4, "0")}`;
};

/* =====================================
   CREATE SUPPLIER
===================================== */
router.post("/create", async (req, res) => {
  try {
    const { supplier_name, category, contact_no } = req.body;

    if (!supplier_name)
      return res.json({ success: false, error: "Supplier name required" });

    const code = await genCode();

    await db.query(
      `
      INSERT INTO suppliers
      (supplier_code, supplier_name, category, contact_no)
      VALUES ($1,$2,$3,$4)
      `,
      [code, supplier_name, category, contact_no]
    );

    res.json({ success: true, message: "Supplier added" });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* =====================================
   LIST SUPPLIERS
===================================== */
router.get("/list", async (req, res) => {
  const q = await db.query(
    `
    SELECT *
    FROM suppliers
    WHERE is_deleted=false
    ORDER BY supplier_code
    `
  );
  res.json({ success: true, rows: q.rows });
});

/* =====================================
   UPDATE SUPPLIER
===================================== */
router.put("/update/:id", async (req, res) => {
  try {
    const { supplier_name, category, contact_no } = req.body;

    await db.query(
      `
      UPDATE suppliers
      SET supplier_name=$1,
          category=$2,
          contact_no=$3
      WHERE id=$4
      `,
      [supplier_name, category, contact_no, req.params.id]
    );

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* =====================================
   DELETE SUPPLIER (PASSWORD)
===================================== */
router.delete("/delete/:id", async (req, res) => {
  const { password } = req.body;

  if (password !== "786") {
    return res.json({ success: false, error: "Invalid password" });
  }

  await db.query(
    `
    UPDATE suppliers
    SET is_deleted=true
    WHERE id=$1
    `,
    [req.params.id]
  );

  res.json({ success: true });
});

module.exports = router;
