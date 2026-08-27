const express = require("express");
const router = express.Router();
const db = require("../db");

// ============================================
// AUTO REF NO GENERATOR
// ============================================
async function generateRefNo() {
  const q = await db.query("SELECT nextval('booking_ref_seq') AS no");
  const no = q.rows[0].no;
  return "PKG-" + String(no).padStart(5, "0");
}

// ============================================
// SAVE BOOKING (NEW + EDIT)
// ============================================
router.post("/save", async (req, res) => {
  try {
    const d = req.body;

    if (d.ref_no) {
      await db.query(
        `
        UPDATE bookings SET
          customer_code=$2,
          customer_name=$3,
          contact_no=$4,
          booking_date=$5,

          adult_count=$6,
          adult_rate=$7,
          child_count=$8,
          child_rate=$9,
          infant_count=$10,
          infant_rate=$11,
          flight_total=$12,

          flights=$13::jsonb,
          hotels=$14::jsonb,
          hotels_total=$15,

          visa=$16::jsonb,
          transport=$17::jsonb,
          transport_total=$18,

          ziyarat=$19::jsonb,
          ziyarat_total=$20,

          flight_sar_total=$21,
          hotel_sar_total=$22,
          visa_sar_total=$23,
          transport_sar_total=$24,
          ziyarat_sar_total=$25,

          flight_sar_rate=$26,
          hotel_sar_rate=$27,
          visa_sar_rate=$28,
          transport_sar_rate=$29,
          ziyarat_sar_rate=$30,

          flight_pkr_total=$31,
          hotel_pkr_total=$32,
          visa_pkr_total=$33,
          transport_pkr_total=$34,
          ziyarat_pkr_total=$35,

          net_pkr_total=$36,
          total_sar=$37,
          total_pkr=$38,
          per_person_qty=$39,
          per_person_final=$40,
          adult_per_person=$41,
          child_per_person=$42,
          infant_per_person=$43,

          show_agent_comm=$44,
          agent_comm=$45::jsonb,
          agent_comm_total=$46,
          show_gifting=$47,
          gifting=$48::jsonb,
          gifting_total=$49

        WHERE ref_no=$1
        `,
        [
          d.ref_no, d.customer_code || null, d.customer_name, d.contact_no, d.booking_date,
          d.adult_count, d.adult_rate, d.child_count, d.child_rate, d.infant_count, d.infant_rate, d.flight_total,
          JSON.stringify(d.flights || []), JSON.stringify(d.hotels || []), d.hotels_total,
          JSON.stringify(d.visa || []), JSON.stringify(d.transport || []), d.transport_total,
          JSON.stringify(d.ziyarat || []), d.ziyarat_total,
          d.flight_sar_total, d.hotel_sar_total, d.visa_sar_total, d.transport_sar_total, d.ziyarat_sar_total,
          d.flight_sar_rate, d.hotel_sar_rate, d.visa_sar_rate, d.transport_sar_rate, d.ziyarat_sar_rate,
          d.flight_pkr_total, d.hotel_pkr_total, d.visa_pkr_total, d.transport_pkr_total, d.ziyarat_pkr_total,
          d.net_pkr_total, d.total_sar, d.total_pkr, d.per_person_qty, d.per_person_final, d.adult_per_person, d.child_per_person, d.infant_per_person,
          d.show_agent_comm, JSON.stringify(d.agent_comm || []), d.agent_comm_total,
          d.show_gifting, JSON.stringify(d.gifting || []), d.gifting_total
        ]
      );

      return res.json({ success: true, ref_no: d.ref_no });
    }

    // INSERT NEW RECORD
    const ref_no = await generateRefNo();

    await db.query(
      `
      INSERT INTO bookings (
        ref_no, customer_code, customer_name, contact_no, booking_date,
        adult_count, adult_rate, child_count, child_rate, infant_count, infant_rate, flight_total,
        flights, hotels, hotels_total, visa, transport, transport_total, ziyarat, ziyarat_total,
        flight_sar_total, hotel_sar_total, visa_sar_total, transport_sar_total, ziyarat_sar_total,
        flight_sar_rate, hotel_sar_rate, visa_sar_rate, transport_sar_rate, ziyarat_sar_rate,
        flight_pkr_total, hotel_pkr_total, visa_pkr_total, transport_pkr_total, ziyarat_pkr_total,
        net_pkr_total, total_sar, total_pkr, per_person_qty, per_person_final, adult_per_person, child_per_person, infant_per_person,
        show_agent_comm, agent_comm, agent_comm_total, show_gifting, gifting, gifting_total
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16::jsonb,$17::jsonb,$18,$19::jsonb,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45::jsonb,$46,$47,$48::jsonb,$49
      )
      `,
      [
        ref_no, d.customer_code || null, d.customer_name, d.contact_no, d.booking_date,
        d.adult_count, d.adult_rate, d.child_count, d.child_rate, d.infant_count, d.infant_rate, d.flight_total,
        JSON.stringify(d.flights || []), JSON.stringify(d.hotels || []), d.hotels_total,
        JSON.stringify(d.visa || []), JSON.stringify(d.transport || []), d.transport_total,
        JSON.stringify(d.ziyarat || []), d.ziyarat_total,
        d.flight_sar_total, d.hotel_sar_total, d.visa_sar_total, d.transport_sar_total, d.ziyarat_sar_total,
        d.flight_sar_rate, d.hotel_sar_rate, d.visa_sar_rate, d.transport_sar_rate, d.ziyarat_sar_rate,
        d.flight_pkr_total, d.hotel_pkr_total, d.visa_pkr_total, d.transport_pkr_total, d.ziyarat_pkr_total,
        d.net_pkr_total, d.total_sar, d.total_pkr, d.per_person_qty, d.per_person_final, d.adult_per_person, d.child_per_person, d.infant_per_person,
        d.show_agent_comm, JSON.stringify(d.agent_comm || []), d.agent_comm_total,
        d.show_gifting, JSON.stringify(d.gifting || []), d.gifting_total
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
  try {
    const q = await db.query(
      "SELECT * FROM bookings WHERE is_deleted = false ORDER BY id DESC"
    );
    res.json(q.rows);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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
  try {
    const q = await db.query(
      "SELECT ref_no, customer_name, booking_date, hotels FROM bookings WHERE ref_no=$1",
      [req.params.ref]
    );

    if (!q.rows.length) return res.json({ success: false });

    res.json({ success: true, ...q.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// SOFT DELETE WITH PURCHASE / PAYMENT CHECK & SYSTEM PASSWORD LOOKUP (BOOKINGS)
// ============================================
router.delete("/delete/:ref", async (req, res) => {
  try {
    const { ref } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.json({ success: false, message: "❌ Delete password is required!" });
    }

    const passCheck = await db.query(
      "SELECT password_val FROM public.system_passwords WHERE key_name = 'delete_pass'"
    );
    
    if (passCheck.rows.length === 0) {
      return res.json({ success: false, message: "❌ Delete password configuration not found in database!" });
    }

    const currentDeletePass = passCheck.rows[0].password_val;

    if (password !== currentDeletePass) {
      return res.json({ success: false, message: "❌ Incorrect Delete Password! Access Denied 😎" });
    }

    const purchaseCheck = await db.query(
      `SELECT SUM(purchase_pkr) AS total
       FROM purchase_entries
       WHERE ref_no = $1 AND is_deleted = false`,
      [ref]
    );

    if (purchaseCheck.rows[0].total > 0) {
      return res.json({
        success: false,
        message: "❌ Cannot delete. Purchase entries exist for this ref. Delete purchases first."
      });
    }

    const paymentCheck = await db.query(
      `SELECT SUM(amount) AS total
       FROM customer_payments
       WHERE ref_no = $1 AND type = 'payment'`,
      [ref]
    );

    if (paymentCheck.rows[0].total > 0) {
      return res.json({
        success: false,
        message: "❌ Cannot delete. Payment has been received for this ref. Adjust/delete payments first."
      });
    }

    const q = await db.query(
      `UPDATE bookings
       SET is_deleted = true
       WHERE ref_no = $1
       RETURNING ref_no`,
      [ref]
    );

    if (!q.rows.length) {
      return res.json({ success: false, error: "Booking not found" });
    }

    res.json({ success: true, message: "✅ Soft deleted successfully" });

  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

// DELETED VIEW
router.get("/get-deleted/:ref", async (req, res) => {
  try {
    const q = await db.query(
      "SELECT * FROM bookings WHERE ref_no=$1 AND is_deleted=true",
      [req.params.ref]
    );

    if (!q.rows.length) return res.json({ success: false });

    res.json({ success: true, row: q.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;