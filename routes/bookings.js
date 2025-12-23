const express = require("express");
const router = express.Router();
const db = require("../db");

// ============================================
// AUTO REF NO GENERATOR
// ============================================
async function generateRefNo() {
  const result = await db.query("SELECT COUNT(*) FROM bookings");
  const count = Number(result.rows[0].count) + 1;
  return "PKG-" + String(count).padStart(5, "0");
}

// ============================================
// SAVE BOOKING (NEW + EDIT)
// ============================================
router.post("/save", async (req, res) => {
  try {
    const d = req.body;

    // ===============================
    // EDIT MODE (UPDATE)
// ===============================
    if (d.ref_no) {
      await db.query(
        `
        UPDATE bookings SET
          customer_name=$2,
          booking_date=$3,
          contact_no=$4,

          adult_count=$5,
          adult_rate=$6,
          child_count=$7,
          child_rate=$8,
          infant_count=$9,
          infant_rate=$10,
          flight_total=$11,

          flights=$12::jsonb,
          hotels=$13::jsonb,
          hotels_total=$14,

          visa_persons=$15,
          visa_rate=$16,
          visa_total=$17,

          transport=$18::jsonb,
          transport_total=$19,

          flight_sar_total=$20,
          hotel_sar_total=$21,
          visa_sar_total=$22,
          transport_sar_total=$23,

          flight_sar_rate=$24,
          hotel_sar_rate=$25,
          visa_sar_rate=$26,
          transport_sar_rate=$27,

          flight_pkr_total=$28,
          hotel_pkr_total=$29,
          visa_pkr_total=$30,
          transport_pkr_total=$31,

          net_pkr_total=$32,
          total_sar=$33,
          total_pkr=$34,
          per_person_qty=$36,
          per_person_final=$36

        WHERE ref_no=$1
        `,
        [
          d.ref_no,
          d.customer_name,
          d.booking_date,
          d.contact_no,

          d.adult_count,
          d.adult_rate,
          d.child_count,
          d.child_rate,
          d.infant_count,
          d.infant_rate,
          d.flight_total,

          JSON.stringify(d.flights || []),
          JSON.stringify(d.hotels || []),
          d.hotels_total,

          d.visa_persons,
          d.visa_rate,
          d.visa_total,

          JSON.stringify(d.transport || []),
          d.transport_total,

          d.flight_sar_total,
          d.hotel_sar_total,
          d.visa_sar_total,
          d.transport_sar_total,

          d.flight_sar_rate,
          d.hotel_sar_rate,
          d.visa_sar_rate,
          d.transport_sar_rate,

          d.flight_pkr_total,
          d.hotel_pkr_total,
          d.visa_pkr_total,
          d.transport_pkr_total,

          d.net_pkr_total,
          d.total_sar,
          d.total_pkr,
          d.per_person_qty,
          d.per_person_final
        ]
      );

      return res.json({ success: true, ref_no: d.ref_no });
    }

    // ===============================
    // NEW MODE (INSERT – FULL DATA)
// ===============================
    const ref_no = await generateRefNo();

    await db.query(
      `
      INSERT INTO bookings (
        ref_no, customer_name, contact_no, booking_date,

        adult_count, adult_rate, child_count, child_rate,
        infant_count, infant_rate, flight_total,

        flights, hotels, hotels_total,

        visa_persons, visa_rate, visa_total,

        transport, transport_total,

        flight_sar_total, hotel_sar_total, visa_sar_total, transport_sar_total,
        flight_sar_rate, hotel_sar_rate, visa_sar_rate, transport_sar_rate,

        flight_pkr_total, hotel_pkr_total, visa_pkr_total, transport_pkr_total,
        net_pkr_total, total_sar, total_pkr,

        per_person_qty, per_person_final
      )
      VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,
        $9,$10,$11,
        $12::jsonb,$13::jsonb,$14,
        $15,$16,$17,
        $18::jsonb,$19,
        $20,$21,$22,$23,
        $24,$25,$26,$27,
        $28,$29,$30,$31,
        $32,$33,$34,
        $35,$36
      )
      `,
      [
        ref_no,
        d.customer_name,
        d.contact_no,
        d.booking_date,

        d.adult_count,
        d.adult_rate,
        d.child_count,
        d.child_rate,
        d.infant_count,
        d.infant_rate,
        d.flight_total,

        JSON.stringify(d.flights || []),
        JSON.stringify(d.hotels || []),
        d.hotels_total,

        d.visa_persons,
        d.visa_rate,
        d.visa_total,

        JSON.stringify(d.transport || []),
        d.transport_total,

        d.flight_sar_total,
        d.hotel_sar_total,
        d.visa_sar_total,
        d.transport_sar_total,

        d.flight_sar_rate,
        d.hotel_sar_rate,
        d.visa_sar_rate,
        d.transport_sar_rate,

        d.flight_pkr_total,
        d.hotel_pkr_total,
        d.visa_pkr_total,
        d.transport_pkr_total,

        d.net_pkr_total,
        d.total_sar,
        d.total_pkr,
        d.per_person_qty,
        d.per_person_final
      ]
    );

    res.json({ success: true, ref_no });

  } catch (err) {
    console.error("SAVE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// GET ALL BOOKINGS
// ============================================
router.get("/list", async (req, res) => {
  const q = await db.query(
    "SELECT * FROM bookings WHERE is_deleted = false ORDER BY id DESC"
  );
  res.json(q.rows);
});

// ============================================
// GET BOOKING BY REF (EDIT)
// ============================================
router.get("/get/:ref", async (req, res) => {
  try {
    const q = await db.query(
      "SELECT * FROM bookings WHERE ref_no=$1 AND is_deleted=false",
      [req.params.ref]
    );

    if (!q.rows.length) return res.json({ success: false });

    res.json({ success: true, row: q.rows[0] });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// HOTEL VOUCHER
// ============================================
router.get("/voucher/:ref", async (req, res) => {
  const q = await db.query(
    "SELECT ref_no, customer_name, booking_date, hotels FROM bookings WHERE ref_no=$1",
    [req.params.ref]
  );

  if (!q.rows.length) return res.json({ success: false });

  res.json({ success: true, ...q.rows[0] });
});

// ============================================
// SOFT DELETE
// ============================================
router.delete("/delete/:ref", async (req, res) => {
  await db.query(
    "UPDATE bookings SET is_deleted=true WHERE ref_no=$1",
    [req.params.ref]
  );
  res.json({ success: true });
});

module.exports = router;
