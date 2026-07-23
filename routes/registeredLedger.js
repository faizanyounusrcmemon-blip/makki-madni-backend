const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   1. REGISTERED LEDGER DETAIL (FETCH NAME FROM CUSTOMERS TABLE)
===================================================== */
router.get("/detail/:customer_code", async (req, res) => {
  try {
    const { customer_code } = req.params;
    const { startDate, endDate } = req.query;

    let balance = 0;
    let customerName = "Registered Customer";

    // Directly fetch customer name from customers table using customer_code
    const custRes = await db.query(
      `SELECT name FROM customers WHERE customer_code = $1 AND (is_deleted = false OR is_deleted IS NULL)`,
      [customer_code]
    );

    if (custRes.rows.length > 0 && custRes.rows[0].name) {
      customerName = custRes.rows[0].name;
    }

    // Load Sales using customer_code
    const salesRes = await db.query(
      `
      SELECT ref_no, booking_date, total_pkr, 'Booking' AS src FROM bookings WHERE customer_code=$1 AND is_deleted=false
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Hotel' AS src FROM hotels WHERE customer_code=$1 AND is_deleted=false
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Visa' AS src FROM visa WHERE customer_code=$1 AND is_deleted=false
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Card' AS src FROM card WHERE customer_code=$1 AND is_deleted=false
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Group' AS src FROM groups WHERE customer_code=$1 AND is_deleted=false
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Ticketing' AS src FROM ticketing WHERE customer_code=$1 AND is_deleted=false
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Transport' AS src FROM transport WHERE customer_code=$1 AND is_deleted=false
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Ziyarat' AS src FROM ziyarat WHERE customer_code=$1 AND is_deleted=false
      `,
      [customer_code]
    );

    // Load Payments & Opening Balances
    const paymentsRes = await db.query(
      `
      SELECT id, payment_date, amount, type, payment_method 
      FROM customer_payments 
      WHERE ref_no=$1
      `,
      [customer_code]
    );

    let allEntries = [];

    // Map Sales: CREDIT (+)
    salesRes.rows.forEach(s => {
      const amt = Math.round(Number(s.total_pkr || 0));
      allEntries.push({
        id: `SALE-${s.ref_no}`,
        date: s.booking_date,
        description: `Sale Invoice (${s.src}) - Ref: ${s.ref_no}`,
        debit: 0,
        credit: amt,
        type: "sale"
      });
    });

    // Map Payments & Opening Balances: DEBIT (-)
    paymentsRes.rows.forEach(p => {
      const amt = Math.round(Number(p.amount || 0));
      if (p.type === "opening_balance") {
        allEntries.push({
          id: p.id,
          date: p.payment_date,
          description: `🔑 Opening Balance (Credit Setup)`,
          debit: 0,
          credit: amt,
          type: "opening_balance"
        });
      } else {
        allEntries.push({
          id: p.id,
          date: p.payment_date,
          description: p.type === "adjustment" ? `Adjustment Receipt (${p.payment_method || ""})` : `Payment Received (${p.payment_method || ""})`,
          debit: amt,
          credit: 0,
          type: "payment"
        });
      }
    });

    // Sort entries chronologically by date
    allEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    let filteredRows = [];
    allEntries.forEach(entry => {
      balance = balance + entry.credit - entry.debit;
      
      let matchDate = true;
      if (startDate && new Date(entry.date) < new Date(startDate)) matchDate = false;
      if (endDate && new Date(entry.date) > new Date(endDate)) matchDate = false;

      if (matchDate) {
        filteredRows.push({
          ...entry,
          balance: balance
        });
      }
    });

    res.json({
      success: true,
      customerName,
      rows: filteredRows,
      totalRemainingBalance: balance
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   2. GET ALL PENDING CUSTOMERS (STRICT CUSTOMER_CODE ONLY FROM CUSTOMERS TABLE)
===================================================== */
router.get("/pending/list", async (req, res) => {
  try {
    // Only fetch valid customer codes strictly from customers master table
    const result = await db.query(
      `
      WITH all_credits AS (
        SELECT customer_code, total_pkr AS amount FROM bookings WHERE customer_code IS NOT NULL AND is_deleted=false
        UNION ALL
        SELECT customer_code, total_pkr FROM hotels WHERE customer_code IS NOT NULL AND is_deleted=false
        UNION ALL
        SELECT customer_code, total_pkr FROM visa WHERE customer_code IS NOT NULL AND is_deleted=false
        UNION ALL
        SELECT customer_code, total_pkr FROM card WHERE customer_code IS NOT NULL AND is_deleted=false
        UNION ALL
        SELECT customer_code, total_pkr FROM groups WHERE customer_code IS NOT NULL AND is_deleted=false
        UNION ALL
        SELECT customer_code, total_pkr FROM ticketing WHERE customer_code IS NOT NULL AND is_deleted=false
        UNION ALL
        SELECT customer_code, total_pkr FROM transport WHERE customer_code IS NOT NULL AND is_deleted=false
        UNION ALL
        SELECT customer_code, total_pkr FROM ziyarat WHERE customer_code IS NOT NULL AND is_deleted=false
        UNION ALL
        SELECT ref_no AS customer_code, amount FROM customer_payments WHERE ref_no IS NOT NULL AND type='opening_balance'
      ),
      
      all_debits AS (
        SELECT ref_no AS customer_code, amount FROM customer_payments WHERE ref_no IS NOT NULL AND type != 'opening_balance'
      ),

      aggregated AS (
        SELECT 
          c.customer_code,
          COALESCE(cr.total_credit, 0) AS total_sale_or_op,
          COALESCE(db.total_debit, 0) AS total_paid
        FROM (
          SELECT customer_code FROM all_credits
          UNION
          SELECT customer_code FROM all_debits
        ) c
        LEFT JOIN (SELECT customer_code, SUM(amount) AS total_credit FROM all_credits GROUP BY customer_code) cr ON c.customer_code = cr.customer_code
        LEFT JOIN (SELECT customer_code, SUM(amount) AS total_debit FROM all_debits GROUP BY customer_code) db ON c.customer_code = db.customer_code
      )

      SELECT 
        cust.customer_code,
        cust.name AS customer_name,
        (COALESCE(a.total_sale_or_op, 0) - COALESCE(a.total_paid, 0)) AS remaining_balance,
        COALESCE(a.total_paid, 0) AS total_paid
      FROM customers cust
      JOIN aggregated a ON cust.customer_code = a.customer_code
      WHERE (cust.is_deleted = false OR cust.is_deleted IS NULL)
        AND (a.total_sale_or_op - a.total_paid) != 0
      ORDER BY cust.customer_code ASC
      `
    );

    let pending = result.rows.map(row => {
      const balance = Number(row.remaining_balance);
      const totalPaid = Number(row.total_paid);
      let status = "PARTIAL";

      if (balance > 0) {
        status = totalPaid === 0 ? "PENDING" : "PARTIAL";
      } else if (balance < 0) {
        status = "EXTRA PAID";
      }

      return {
        customer_code: row.customer_code,
        customer_name: row.customer_name,
        remaining_balance: balance,
        payment_status: status
      };
    });

    res.json({ success: true, rows: pending });
  } catch (err) {
    console.error("Error in pending list:", err);
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   3. SAVE REGISTERED CUSTOMER PAYMENT / OPENING BALANCE
===================================================== */
router.post("/payment", async (req, res) => {
  const client = await db.connect();
  try {
    const { customer_code, amount, payment_method, type, payment_date } = req.body;

    if (!customer_code) return res.json({ success: false, error: "Customer Code is required" });
    if (!amount || Number(amount) <= 0) return res.json({ success: false, error: "Amount must be greater than zero" });
    if (!payment_date) return res.json({ success: false, error: "Payment Date is required" });

    await client.query("BEGIN");
    
    await client.query(
      `
      INSERT INTO customer_payments (ref_no, amount, payment_method, type, payment_date)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [customer_code, amount, payment_method, type, payment_date]
    );
    await client.query("COMMIT");

    res.json({ success: true, message: "Transaction saved successfully!" });
  } catch (err) {
    await client.query("ROLLBACK");
    res.json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

/* =====================================================
   4. DELETE PAYMENT
===================================================== */
router.post("/delete/:id", async (req, res) => {
  try {
    const { password } = req.body;

    const passCheck = await db.query(
      "SELECT password_val FROM system_passwords WHERE key_name = $1",
      ["delete_registered_payment"]
    );

    if (passCheck.rows.length === 0) {
      return res.json({ success: false, error: "Delete Password is not configured in DB." });
    }

    if (password !== passCheck.rows[0].password_val) {
      return res.json({ success: false, error: "Invalid Authorization Password!" });
    }

    await db.query("DELETE FROM customer_payments WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: "Entry deleted successfully" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   5. EDIT PAYMENT
===================================================== */
router.put("/edit/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { password, amount, payment_date, payment_method, type } = req.body;

    if (!id || isNaN(id)) {
      return res.json({ success: false, error: "Invalid transaction ID" });
    }

    if (!amount || Number(amount) <= 0) {
      return res.json({ success: false, error: "Amount must be greater than zero" });
    }

    const passCheck = await db.query(
      "SELECT password_val FROM system_passwords WHERE key_name = $1",
      ["delete_registered_payment"]
    );

    if (passCheck.rows.length === 0) {
      return res.json({ success: false, error: "Delete/Edit Password is not configured in DB." });
    }

    if (password !== passCheck.rows[0].password_val) {
      return res.json({ success: false, error: "Invalid Authorization Password!" });
    }

    const check = await db.query("SELECT id FROM customer_payments WHERE id = $1", [id]);
    if (check.rows.length === 0) {
      return res.json({ success: false, error: "Payment entry not found!" });
    }

    await db.query(
      `
      UPDATE customer_payments
      SET amount = $1, payment_date = $2, payment_method = $3, type = $4
      WHERE id = $5
      `,
      [amount, payment_date, payment_method, type, id]
    );

    res.json({ success: true, message: "Entry updated successfully" });
  } catch (err) {
    console.error("Edit error:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;