const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   1. REGISTERED LEDGER DETAIL (FIXED RUNNING BALANCE)
===================================================== */
router.get("/detail/:customer_code", async (req, res) => {
  try {
    const { customer_code } = req.params;
    const { startDate, endDate } = req.query;

    let customerName = "Registered Customer";
    let snapshotId = null;
    let snapshotDate = null;
    let openingBalance = 0;

    // Fetch customer name
    const custRes = await db.query(
      `SELECT name FROM customers WHERE customer_code = $1 AND (is_deleted = false OR is_deleted IS NULL)`,
      [customer_code]
    );

    if (custRes.rows.length > 0 && custRes.rows[0].name) {
      customerName = custRes.rows[0].name;
    }

    // Fetch Latest Archive Snapshot
    const snapshot = await db.query(`
      SELECT id, date_to 
      FROM archive_snapshots 
      ORDER BY id DESC LIMIT 1
    `);

    if (snapshot.rows.length > 0) {
      snapshotId = snapshot.rows[0].id;
      snapshotDate = snapshot.rows[0].date_to;

      // Snapshot Customer Balance
      const balRes = await db.query(
        `SELECT balance FROM archive_balances 
         WHERE snapshot_id = $1 AND balance_type = 'CUSTOMER' AND code = $2`,
        [snapshotId, customer_code]
      );
      openingBalance = Number(balRes.rows[0]?.balance || 0);
    }

    // Load Live Sales AFTER Snapshot Date
    const salesRes = await db.query(
      `
      SELECT ref_no, booking_date, total_pkr, 'Booking' AS src FROM bookings WHERE customer_code=$1 AND is_deleted=false AND ($2::date IS NULL OR booking_date > $2)
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Hotel' AS src FROM hotels WHERE customer_code=$1 AND is_deleted=false AND ($2::date IS NULL OR booking_date > $2)
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Visa' AS src FROM visa WHERE customer_code=$1 AND is_deleted=false AND ($2::date IS NULL OR booking_date > $2)
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Card' AS src FROM card WHERE customer_code=$1 AND is_deleted=false AND ($2::date IS NULL OR booking_date > $2)
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Group' AS src FROM groups WHERE customer_code=$1 AND is_deleted=false AND ($2::date IS NULL OR booking_date > $2)
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Ticketing' AS src FROM ticketing WHERE customer_code=$1 AND is_deleted=false AND ($2::date IS NULL OR booking_date > $2)
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Transport' AS src FROM transport WHERE customer_code=$1 AND is_deleted=false AND ($2::date IS NULL OR booking_date > $2)
      UNION ALL
      SELECT ref_no, booking_date, total_pkr, 'Ziyarat' AS src FROM ziyarat WHERE customer_code=$1 AND is_deleted=false AND ($2::date IS NULL OR booking_date > $2)
      `,
      [customer_code, snapshotDate]
    );

    // Load Live Payments & Opening Balances AFTER Snapshot Date
    const paymentsRes = await db.query(
      `
      SELECT id, payment_date, amount, type, payment_method 
      FROM customer_payments 
      WHERE ref_no = $1 AND ($2::date IS NULL OR payment_date > $2)
      `,
      [customer_code, snapshotDate]
    );

    let allEntries = [];

    // Push Snapshot Balance Row (if exists)
    if (openingBalance !== 0 || snapshotDate) {
      allEntries.push({
        id: "SNAPSHOT",
        date: snapshotDate,
        description: `Snapshot Opening Balance`,
        debit: 0,
        credit: openingBalance,
        type: "snapshot",
        seq: 0 // Priority index for tie-breaker
      });
    }

    // Map Sales: CREDIT (+)
    salesRes.rows.forEach(s => {
      const amt = Math.round(Number(s.total_pkr || 0));
      allEntries.push({
        id: `SALE-${s.ref_no}`,
        date: s.booking_date,
        description: `Sale Invoice (${s.src}) - Ref: ${s.ref_no}`,
        debit: 0,
        credit: amt,
        type: "sale",
        seq: 1
      });
    });

    // Map Payments: DEBIT (-) & Opening Balances: CREDIT (+)
    paymentsRes.rows.forEach(p => {
      const amt = Math.round(Number(p.amount || 0));
      if (p.type === "opening_balance") {
        allEntries.push({
          id: p.id,
          date: p.payment_date,
          description: `Opening Balance (Credit Setup)`,
          payment_method: p.payment_method || "-",
          debit: 0,
          credit: amt,
          type: "opening_balance",
          seq: 1
        });
      } else {
        allEntries.push({
          id: p.id,
          date: p.payment_date,
          description: p.type === "adjustment" ? `Adjustment Receipt (${p.payment_method || ""})` : `Payment Received (${p.payment_method || ""})`,
          payment_method: p.payment_method || "-",
          debit: amt,
          credit: 0,
          type: "payment",
          seq: 2
        });
      }
    });

    // 🔴 STRICT SORTING: Date + Priority Sequence (Snapshot -> Sales -> Payments)
    allEntries.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();

      if (dateA !== dateB) {
        return dateA - dateB;
      }
      return (a.seq || 0) - (b.seq || 0);
    });

    let runningBalance = 0;
    let calculatedRows = [];

    // 🔴 CHRONOLOGICAL RUNNING BALANCE
    allEntries.forEach((entry) => {
      runningBalance = runningBalance + Number(entry.credit || 0) - Number(entry.debit || 0);

      let matchDate = true;
      if (startDate && new Date(entry.date) < new Date(startDate)) matchDate = false;
      if (endDate && new Date(entry.date) > new Date(endDate)) matchDate = false;

      if (matchDate) {
        calculatedRows.push({
          ...entry,
          balance: runningBalance
        });
      }
    });

    // UI display array reversed (Newest top par)
    calculatedRows.reverse();

    res.json({
      success: true,
      customerName,
      rows: calculatedRows,
      totalRemainingBalance: runningBalance
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.message });
  }
});


/* =====================================================
   2. PENDING CUSTOMERS LIST (WITH SNAPSHOT CALCULATIONS)
===================================================== */
router.get("/pending/list", async (req, res) => {
  try {
    let snapshotId = null;
    let snapshotDate = null;

    const snapshot = await db.query(`
      SELECT id, date_to FROM archive_snapshots ORDER BY id DESC LIMIT 1
    `);

    if (snapshot.rows.length) {
      snapshotId = snapshot.rows[0].id;
      snapshotDate = snapshot.rows[0].date_to;
    }

    const result = await db.query(
      `
      WITH all_credits AS (
        SELECT customer_code, total_pkr AS amount FROM bookings WHERE customer_code IS NOT NULL AND is_deleted=false AND ($1::date IS NULL OR booking_date > $1)
        UNION ALL
        SELECT customer_code, total_pkr FROM hotels WHERE customer_code IS NOT NULL AND is_deleted=false AND ($1::date IS NULL OR booking_date > $1)
        UNION ALL
        SELECT customer_code, total_pkr FROM visa WHERE customer_code IS NOT NULL AND is_deleted=false AND ($1::date IS NULL OR booking_date > $1)
        UNION ALL
        SELECT customer_code, total_pkr FROM card WHERE customer_code IS NOT NULL AND is_deleted=false AND ($1::date IS NULL OR booking_date > $1)
        UNION ALL
        SELECT customer_code, total_pkr FROM groups WHERE customer_code IS NOT NULL AND is_deleted=false AND ($1::date IS NULL OR booking_date > $1)
        UNION ALL
        SELECT customer_code, total_pkr FROM ticketing WHERE customer_code IS NOT NULL AND is_deleted=false AND ($1::date IS NULL OR booking_date > $1)
        UNION ALL
        SELECT customer_code, total_pkr FROM transport WHERE customer_code IS NOT NULL AND is_deleted=false AND ($1::date IS NULL OR booking_date > $1)
        UNION ALL
        SELECT customer_code, total_pkr FROM ziyarat WHERE customer_code IS NOT NULL AND is_deleted=false AND ($1::date IS NULL OR booking_date > $1)
        UNION ALL
        SELECT ref_no AS customer_code, amount FROM customer_payments WHERE ref_no IS NOT NULL AND type='opening_balance' AND ($1::date IS NULL OR payment_date > $1)
      ),
      
      all_debits AS (
        SELECT ref_no AS customer_code, amount FROM customer_payments WHERE ref_no IS NOT NULL AND type != 'opening_balance' AND ($1::date IS NULL OR payment_date > $1)
      ),

      snapshot_balances AS (
        SELECT code, balance FROM archive_balances WHERE snapshot_id = $2 AND balance_type = 'CUSTOMER'
      )

      SELECT 
        cust.customer_code,
        cust.name AS customer_name,
        ROUND(
          COALESCE(sb.balance, 0) + 
          COALESCE(cr.total_credit, 0) - 
          COALESCE(db.total_debit, 0)
        ) AS remaining_balance,
        ROUND(COALESCE(db.total_debit, 0)) AS total_paid
      FROM customers cust
      LEFT JOIN snapshot_balances sb ON sb.code = cust.customer_code
      LEFT JOIN (SELECT customer_code, SUM(amount) AS total_credit FROM all_credits GROUP BY customer_code) cr ON cust.customer_code = cr.customer_code
      LEFT JOIN (SELECT customer_code, SUM(amount) AS total_debit FROM all_debits GROUP BY customer_code) db ON cust.customer_code = db.customer_code
      WHERE (cust.is_deleted = false OR cust.is_deleted IS NULL)
        AND ABS(
          COALESCE(sb.balance, 0) + 
          COALESCE(cr.total_credit, 0) - 
          COALESCE(db.total_debit, 0)
        ) >= 1
      ORDER BY cust.customer_code ASC
      `,
      [snapshotDate, snapshotId]
    );

    let pending = result.rows
      .map(row => {
        const balance = Math.round(Number(row.remaining_balance || 0));
        const totalPaid = Math.round(Number(row.total_paid || 0));

        if (Math.abs(balance) < 1) return null;

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
      })
      .filter(Boolean);

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
   VERIFY PASSWORD FOR EDIT / DELETE
===================================================== */
router.post("/verify-password", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.json({ success: false, error: "Password is required" });
    }

    const passCheck = await db.query(
      "SELECT password_val FROM system_passwords WHERE key_name = $1",
      ["delete_registered_payment"]
    );

    if (passCheck.rows.length === 0) {
      return res.json({ success: false, error: "System password not configured!" });
    }

    if (password !== passCheck.rows[0].password_val) {
      return res.json({ success: false, error: "Wrong Password!" });
    }

    res.json({ success: true, message: "Password verified" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   EDIT REGISTERED CUSTOMER PAYMENT
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

    if (!payment_date) {
      return res.json({ success: false, error: "Payment date is required" });
    }

    const passCheck = await db.query(
      "SELECT password_val FROM system_passwords WHERE key_name = $1",
      ["delete_registered_payment"]
    );

    if (passCheck.rows.length === 0) {
      return res.json({ success: false, error: "Authorization password is not configured in DB." });
    }

    if (password !== passCheck.rows[0].password_val) {
      return res.json({ success: false, error: "Invalid Authorization Password!" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const check = await client.query(
        "SELECT id, ref_no, type, payment_method FROM customer_payments WHERE id = $1",
        [id]
      );

      if (check.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.json({ success: false, error: "Payment entry not found!" });
      }

      const existingRecord = check.rows[0];
      const updatedType = type || existingRecord.type || "payment";
      const updatedMethod = payment_method || existingRecord.payment_method || "Bank";

      await client.query(
        `
        UPDATE customer_payments
        SET amount = $1, payment_date = $2, payment_method = $3, type = $4
        WHERE id = $5
        `,
        [amount, payment_date, updatedMethod, updatedType, id]
      );

      await client.query("COMMIT");

      res.json({ success: true, message: "Registered payment entry updated successfully" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Registered Edit error:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;