const express = require("express");
const router = express.Router();
const db = require("../db");

// AUTO REF
async function generateRef() {
  const r = await db.query("SELECT COUNT(*) FROM transport");
  return "TRN-" + (Number(r.rows[0].count) + 1).toString().padStart(5, "0");
}

// ========================
// SAVE / UPDATE
// ========================
router.post("/save", async (req, res) => {
  try {
    const {
      ref_no,
      customer_name,
      booking_date,
      rows,
      total_sar,
      pkr_rate,
      total_pkr,
    } = req.body;

    let finalRef = ref_no;

    if (!finalRef) {
      finalRef = await generateRef();

      await db.query(
        `
        INSERT INTO transport
        (ref_no, customer_name, booking_date, rows, total_sar, pkr_rate, total_pkr)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          finalRef,
          customer_name,
          booking_date,
          JSON.stringify(rows || []),
          total_sar,
          pkr_rate,
          total_pkr,
        ]
      );
    } else {
      await db.query(
        `
        UPDATE transport SET
          customer_name=$1,
          booking_date=$2,
          rows=$3,
          total_sar=$4,
          pkr_rate=$5,
          total_pkr=$6
        WHERE ref_no=$7
        `,
        [
          customer_name,
          booking_date,
          JSON.stringify(rows || []),
          total_sar,
          pkr_rate,
          total_pkr,
          finalRef,
        ]
      );
    }

    res.json({ success: true, ref_no: finalRef });

  } catch (err) {
    console.error("TRANSPORT SAVE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========================
// GET BY REF
// ========================
router.get("/get/:ref", async (req, res) => {
  const q = await db.query(
    "SELECT * FROM transport WHERE ref_no=$1 AND is_deleted=false",
    [req.params.ref]
  );

  if (q.rows.length === 0)
    return res.json({ success: false });

  res.json({ success: true, row: q.rows[0] });
});

router.delete("/delete/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;

    const q = await db.query(
      `UPDATE transport
       SET is_deleted = true
       WHERE ref_no = $1
       RETURNING ref_no`,
      [ref_no]
    );

    if (!q.rows.length)
      return res.json({ success: false, error: "Transport not found" });

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});


module.exports = router;
