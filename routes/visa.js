const express = require("express");
const router = express.Router();
const db = require("../db");

// AUTO REF
async function generateRef() {
  const r = await db.query("SELECT COUNT(*) FROM visa");
  return "VISA-" + String(Number(r.rows[0].count) + 1).padStart(5, "0");
}

/* ---------------------------------------------------
   SAVE VISA
--------------------------------------------------- */
router.post("/save", async (req, res) => {
  try {
    const {
      customer_name,
      booking_date,
      rows,
      persons,
      rate,
      total_sar,
      pkr_rate,
      total_pkr
    } = req.body;

    const ref_no = await generateRef();

    await db.query(
      `
      INSERT INTO visa
      (
        ref_no,
        customer_name,
        booking_date,
        persons,
        rate,
        total_sar,
        pkr_rate,
        total_pkr,
        rows
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        ref_no,
        customer_name,
        booking_date,
        persons,
        rate,
        total_sar,
        pkr_rate,
        total_pkr,
        JSON.stringify(rows || [])
      ]
    );

    res.json({ success: true, ref_no });

  } catch (err) {
    console.log("VISA SAVE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ---------------------------------------------------
   GET VISA BY ID  ✅ (MISSING — NOW FIXED)
--------------------------------------------------- */
router.get("/get/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "SELECT * FROM visa WHERE id = $1 AND is_deleted = false",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Visa not found" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.log("VISA GET ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
