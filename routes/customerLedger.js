const express = require("express");
const router = express.Router();
const db = require("../db");

 /* ===============================
   PAYMENT STATUS UPDATE
================================ */
async function updatePaymentStatus(ref_no) {

  const sale = await db.query(
    `
    SELECT SUM(amount) AS total_sale
    FROM (
      SELECT total_pkr AS amount FROM bookings WHERE ref_no=$1 AND is_deleted=false
      UNION ALL
      SELECT total_pkr FROM hotels WHERE ref_no=$1 AND is_deleted=false
      UNION ALL
      SELECT total_pkr FROM visa WHERE ref_no=$1 AND is_deleted=false
      UNION ALL
      SELECT total_pkr FROM card WHERE ref_no=$1 AND is_deleted=false
      UNION ALL
      SELECT total_pkr FROM ticketing WHERE ref_no=$1 AND is_deleted=false
      UNION ALL
      SELECT total_pkr FROM transport WHERE ref_no=$1 AND is_deleted=false
      UNION ALL
      SELECT total_pkr FROM ziyarat WHERE ref_no=$1 AND is_deleted=false
    ) x
    `,
    [ref_no]
  );

  const totalSale = Number(sale.rows[0]?.total_sale || 0);

  const paid = await db.query(
    `
    SELECT COALESCE(SUM(amount),0) AS total_paid
    FROM customer_payments
    WHERE ref_no=$1
    `,
    [ref_no]
  );

  const totalPaid = Number(paid.rows[0]?.total_paid || 0);

  let paymentStatus = "PENDING";

  if (totalPaid <= 0) {
    paymentStatus = "PENDING";
  } else if (totalPaid < totalSale) {
    paymentStatus = "PARTIAL";
  } else {
    paymentStatus = "COMPLETE";
  }

  let tableName = null;

  if (ref_no.startsWith("PKG-")) tableName = "bookings";
  else if (ref_no.startsWith("HOT-")) tableName = "hotels";
  else if (ref_no.startsWith("VISA-")) tableName = "visa";
  else if (ref_no.startsWith("CARD-")) tableName = "card";
  else if (ref_no.startsWith("TIC-")) tableName = "ticketing";
  else if (ref_no.startsWith("TRN-")) tableName = "transport";
  else if (ref_no.startsWith("ZIY-")) tableName = "ziyarat";

  if (tableName) {
    await db.query(
      `UPDATE ${tableName}
       SET payment_status=$1
       WHERE ref_no=$2`,
      [paymentStatus, ref_no]
    );
  }

  return paymentStatus;
}



/* ===============================
   CUSTOMER LEDGER (DETAIL)
================================ */
router.get("/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;
    let rows = [];
    let balance = 0;

    let customerName = "Customer";
    let baseDate = new Date();

    const bk = await db.query(
      `
      SELECT customer_name, booking_date
      FROM bookings
      WHERE ref_no=$1 AND is_deleted=false
      
      UNION ALL
      SELECT customer_name, booking_date
      FROM hotels
      WHERE ref_no=$1 AND is_deleted=false

      UNION ALL
      SELECT customer_name, booking_date
      FROM visa
      WHERE ref_no=$1 AND is_deleted=false

      UNION ALL
      SELECT customer_name, booking_date
      FROM card
      WHERE ref_no=$1 AND is_deleted=false


      UNION ALL
      SELECT customer_name, booking_date
      FROM ticketing
      WHERE ref_no=$1 AND is_deleted=false


      UNION ALL
      SELECT customer_name, booking_date
      FROM transport
      WHERE ref_no=$1 AND is_deleted=false


      UNION ALL
      SELECT customer_name, booking_date
      FROM ziyarat
      WHERE ref_no=$1 AND is_deleted=false
      `,
      [ref_no]
    );

    if (bk.rows.length) {
      customerName = bk.rows[0].customer_name;
      baseDate = bk.rows[0].booking_date;
    }

    rows.push({
      id: "CUSTOMER",
      date: baseDate,
      description: `Customer: ${customerName}`,
      debit: null,
      credit: null,
      balance: null,
    });

    /* =========================
       TOTAL SALE (STANDARD)
    ========================= */
    const sale = await db.query(
      `
      SELECT SUM(total_pkr) AS amount FROM bookings WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM hotels WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM visa WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM card WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM ticketing WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM transport WHERE ref_no=$1 AND is_deleted=false
      UNION ALL SELECT SUM(total_pkr) FROM ziyarat WHERE ref_no=$1 AND is_deleted=false
      `,
      [ref_no]
    );

    const totalSale = Math.round(
      sale.rows.reduce((sum, r) => sum + Number(r.amount || 0), 0)
    );

    if (totalSale > 0) {
      balance = totalSale;
      rows.push({
        id: "SALE",
        date: baseDate,
        description: "Sale Entry",
        debit: 0,
        credit: totalSale,
        balance,
      });
    }

    /* =========================
       PAYMENTS
    ========================= */
    const pays = await db.query(
      `
      SELECT id, payment_date, amount, type
      FROM customer_payments
      WHERE ref_no=$1
      ORDER BY payment_date, id
      `,
      [ref_no]
    );

    pays.rows.forEach((p) => {
      const amt = Math.round(Number(p.amount || 0));
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

    res.json({ success: true, rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   PAYMENT PENDING / PARTIAL LIST
===================================================== */
router.get("/pending/list", async (req, res) => {
  try {

    const result = await db.query(`
      SELECT *
      FROM (

        SELECT
          ref_no,
          customer_name,
          payment_status
        FROM bookings
        WHERE is_deleted=false
          AND payment_status IN ('PENDING','PARTIAL')

        UNION ALL

        SELECT
          ref_no,
          customer_name,
          payment_status
        FROM hotels
        WHERE is_deleted=false
          AND payment_status IN ('PENDING','PARTIAL')

        UNION ALL

        SELECT
          ref_no,
          customer_name,
          payment_status
        FROM visa
        WHERE is_deleted=false
          AND payment_status IN ('PENDING','PARTIAL')

        UNION ALL

        SELECT
          ref_no,
          customer_name,
          payment_status
        FROM card
        WHERE is_deleted=false
          AND payment_status IN ('PENDING','PARTIAL')

        UNION ALL

        SELECT
          ref_no,
          customer_name,
          payment_status
        FROM ticketing
        WHERE is_deleted=false
          AND payment_status IN ('PENDING','PARTIAL')

        UNION ALL

        SELECT
          ref_no,
          customer_name,
          payment_status
        FROM transport
        WHERE is_deleted=false
          AND payment_status IN ('PENDING','PARTIAL')

        UNION ALL

        SELECT
          ref_no,
          customer_name,
          payment_status
        FROM ziyarat
        WHERE is_deleted=false
          AND payment_status IN ('PENDING','PARTIAL')

      ) x
      ORDER BY ref_no DESC
    `);

    res.json({
      success: true,
      rows: result.rows
    });

  } catch (err) {
    res.json({
      success: false,
      error: err.message
    });
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

    await updatePaymentStatus(ref_no);

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ===============================
   DELETE PAYMENT
================================ */
router.delete("/delete/:id", async (req, res) => {
  try {

    const { password } = req.body;

    if (password !== "786") {
      return res.json({
        success: false,
        error: "Wrong password"
      });
    }

    const p = await db.query(
      `SELECT ref_no FROM customer_payments WHERE id=$1`,
      [req.params.id]
    );

    if (!p.rows.length) {
      return res.json({
        success: false,
        error: "Payment not found"
      });
    }

    const ref_no = p.rows[0].ref_no;

    await db.query(
      `DELETE FROM customer_payments WHERE id=$1`,
      [req.params.id]
    );

    await updatePaymentStatus(ref_no);

    res.json({ success: true });

  } catch (err) {

    res.json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;




