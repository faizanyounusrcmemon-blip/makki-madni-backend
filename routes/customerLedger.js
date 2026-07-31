const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   HELPER: SALE AMOUNT (Live Tables + Customers + Archive)
===================================================== */
async function getSaleAmount(ref_no) {
  const cleanRef = (ref_no || "").trim();
  const tables = ["bookings", "hotels", "visa", "card", "groups", "ticketing", "transport", "ziyarat"];
  let totalSale = 0;

  // 1. Live booking / sales tables (Filter out entries where customer_code is linked if searching by ref_no)
  for (const tbl of tables) {
    try {
      const res = await db.query(
        `SELECT total_pkr AS amount, customer_code FROM ${tbl} 
         WHERE TRIM(LOWER(ref_no)) = LOWER($1) OR TRIM(LOWER(customer_code)) = LOWER($1)`,
        [cleanRef]
      );

      if (res.rows.length > 0) {
        res.rows.forEach(r => {
          // Agar hum customer_code se search kar rahe hain, to sab add karo
          // Agar ref_no se search kar rahe hain aur customer_code pehle se set hai, to ignore karo
          totalSale += Number(r.amount || 0);
        });
      }
    } catch (e) {
      // Column missing ignore
    }
  }

  // 2. Registered Customers table (Opening balance)
  if (totalSale === 0) {
    try {
      const custRes = await db.query(
        `SELECT opening_balance AS balance FROM customers WHERE TRIM(LOWER(customer_code)) = LOWER($1) OR TRIM(LOWER(code)) = LOWER($1) LIMIT 1`,
        [cleanRef]
      );
      if (custRes.rows.length > 0) {
        totalSale = Number(custRes.rows[0].balance || 0);
      }
    } catch (e) {}
  }

  // 3. Archive balances table fallback
  if (totalSale === 0) {
    try {
      const arch = await db.query(
        `SELECT balance FROM archive_balances WHERE TRIM(LOWER(code)) = LOWER($1) LIMIT 1`,
        [cleanRef]
      );
      if (arch.rows.length > 0) {
        totalSale = Number(arch.rows[0].balance || 0);
      }
    } catch (e) {}
  }

  return totalSale;
}

/* =====================================================
   HELPER: UPDATE PAYMENT STATUS
===================================================== */
async function updatePaymentStatus(ref_no) {
  try {
    const totalSale = await getSaleAmount(ref_no);

    const paid = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS paid FROM customer_payments WHERE TRIM(LOWER(ref_no)) = LOWER($1)`,
      [(ref_no || "").trim()]
    );

    const totalPaid = Number(paid.rows[0]?.paid || 0);
    let status = "PENDING";

    if (totalSale <= 0) status = "PENDING";
    else if (totalPaid <= 0) status = "PENDING";
    else if (totalPaid < totalSale) status = "PARTIAL";
    else status = "COMPLETE";

    let table = null;
    const cleanRef = ref_no.toUpperCase();
    if (cleanRef.startsWith("PKG-")) table = "bookings";
    else if (cleanRef.startsWith("HOT-")) table = "hotels";
    else if (cleanRef.startsWith("VISA-")) table = "visa";
    else if (cleanRef.startsWith("CARD-")) table = "card";
    else if (cleanRef.startsWith("GRP-")) table = "groups";
    else if (cleanRef.startsWith("TIC-")) table = "ticketing";
    else if (cleanRef.startsWith("TRN-")) table = "transport";
    else if (cleanRef.startsWith("ZIY-")) table = "ziyarat";

    if (table) {
      await db.query(
        `UPDATE ${table} SET payment_status = $1 WHERE TRIM(LOWER(ref_no)) = LOWER($2)`,
        [status, (ref_no || "").trim()]
      );
    }

    return status;
  } catch (err) {
    console.error("Error updating payment status:", err.message);
  }
}

/* =====================================================
   PAYMENT PENDING / PARTIAL LIST
===================================================== */
router.get("/pending/list", async (req, res) => {
  try {
    const tables = ["bookings", "hotels", "visa", "card", "groups", "ticketing", "transport", "ziyarat"];
    let allPending = [];

    // 1. Live Sales Pending (SIRF WOH JINME customer_code KHALI / NULL HO)
    for (const tbl of tables) {
      try {
        const result = await db.query(
          `SELECT ref_no, customer_name, payment_status 
           FROM ${tbl} 
           WHERE payment_status IN ('PENDING','PARTIAL') 
           AND (customer_code IS NULL OR TRIM(customer_code) = '')`
        );
        allPending.push(...result.rows);
      } catch (e) {}
    }

    // 2. Registered Customers Pending (Inka customer_code se ledger banta hai)
    try {
      const custRes = await db.query(
        `SELECT customer_code AS ref_no, name AS customer_name, 'PENDING' AS payment_status 
         FROM customers 
         WHERE opening_balance > 0`
      );
      allPending.push(...custRes.rows);
    } catch (e) {}

    // 3. Archive Balances List Pending (FIXED: Filter out CUST- registered codes)
    try {
      const archRes = await db.query(
        `SELECT code AS ref_no, name AS customer_name, 'PENDING' AS payment_status 
         FROM archive_balances 
         WHERE balance_type = 'CUSTOMER' 
         AND UPPER(code) NOT LIKE 'CUST-%'`
      );
      allPending.push(...archRes.rows);
    } catch (e) {}

    allPending.sort((a, b) => (b.ref_no > a.ref_no ? 1 : -1));

    res.json({
      success: true,
      rows: allPending
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   CUSTOMER LEDGER DETAIL
===================================================== */
router.get("/:ref_no", async (req, res) => {
  try {
    const ref_no = (req.params.ref_no || "").trim();
    let rows = [];
    let balance = 0;
    let customerName = null;
    let baseDate = new Date();

    const tables = ["bookings", "hotels", "visa", "card", "groups", "ticketing", "transport", "ziyarat"];

    // 1. Pehle check karein kya yeh ref_no kisi Registered Customer Code ka hissa to nahi
    for (const tbl of tables) {
      try {
        const checkRef = await db.query(
          `SELECT ref_no, customer_code FROM ${tbl} WHERE TRIM(LOWER(ref_no)) = LOWER($1) LIMIT 1`,
          [ref_no]
        );
        if (checkRef.rows.length > 0 && checkRef.rows[0].customer_code && checkRef.rows[0].customer_code.trim() !== "") {
          const linkedCode = checkRef.rows[0].customer_code.trim();
          return res.json({
            success: false,
            error: `Yeh Ref No (${ref_no}) Registered Customer Code [${linkedCode}] par mapped hai. Iska ledger Customer Code [${linkedCode}] se load karein.`
          });
        }
      } catch (e) {}
    }

    // 2. Check live sales tables (Walk-in sales jinka customer_code NULL ho ya directly Customer Code search kiya ho)
    for (const tbl of tables) {
      try {
        const customer = await db.query(
          `SELECT customer_name, booking_date FROM ${tbl} WHERE TRIM(LOWER(ref_no)) = LOWER($1) OR TRIM(LOWER(customer_code)) = LOWER($1) LIMIT 1`,
          [ref_no]
        );
        if (customer.rows.length > 0) {
          customerName = customer.rows[0].customer_name || "Walk-in Customer";
          baseDate = customer.rows[0].booking_date || new Date();
          break;
        }
      } catch (e) {}
    }

    // 3. Check Registered Customers Table
    if (!customerName) {
      try {
        const cust = await db.query(
          `SELECT name AS customer_name, created_at FROM customers WHERE TRIM(LOWER(customer_code)) = LOWER($1) OR TRIM(LOWER(code)) = LOWER($1) LIMIT 1`,
          [ref_no]
        );
        if (cust.rows.length > 0) {
          customerName = cust.rows[0].customer_name;
          baseDate = cust.rows[0].created_at || new Date();
        }
      } catch (e) {}
    }

    // 4. Check archive_balances Table
    if (!customerName) {
      try {
        const arch = await db.query(
          `SELECT name AS customer_name FROM archive_balances WHERE TRIM(LOWER(code)) = LOWER($1) LIMIT 1`,
          [ref_no]
        );
        if (arch.rows.length > 0) {
          customerName = arch.rows[0].customer_name || "Walk-in Customer";
        }
      } catch (e) {}
    }

    if (!customerName) {
      return res.json({
        success: false,
        error: `No record found for Customer / Reference No: ${ref_no}`
      });
    }

    /* HEADER */
    rows.push({
      id: "CUSTOMER",
      date: baseDate,
      description: `Customer: ${customerName}`,
      debit: 0,
      credit: 0,
      balance: 0
    });

    /* SALE / OPENING BALANCE */
    const totalSale = Math.round(await getSaleAmount(ref_no));

    if (totalSale > 0) {
      balance += totalSale;
      rows.push({
        id: "SALE",
        date: baseDate,
        description: "Sale Invoice / Opening Balance",
        debit: 0,
        credit: totalSale,
        balance
      });
    }

    /* PAYMENTS */
    const payments = await db.query(
      `SELECT id, payment_date, amount, type, payment_method FROM customer_payments WHERE TRIM(LOWER(ref_no)) = LOWER($1) ORDER BY payment_date, id`,
      [ref_no]
    );

    payments.rows.forEach(p => {
      const amount = Math.round(Number(p.amount || 0));
      balance -= amount;

      rows.push({
        id: p.id,
        date: p.payment_date,
        description: p.type === "adjustment" ? "Adjustment" : `Payment Received (${p.payment_method || ""})`,
        debit: amount,
        credit: 0,
        balance
      });
    });

    res.json({
      success: true,
      customer: customerName,
      rows
    });

  } catch (err) {
    console.error("CUSTOMER LEDGER ERROR:", err);
    res.json({
      success: false,
      error: err.message
    });
  }
});

/* =====================================================
   SAVE CUSTOMER PAYMENT
===================================================== */
router.post("/payment", async (req, res) => {
  const client = await db.connect();
  try {
    const { ref_no, amount, payment_method, type, payment_date } = req.body;

    if (!ref_no) return res.json({ success: false, error: "Ref No required" });
    if (!amount || Number(amount) <= 0) return res.json({ success: false, error: "Invalid amount" });
    if (!payment_date) return res.json({ success: false, error: "Date required" });

    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO customer_payments (ref_no, amount, payment_method, type, payment_date)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [ref_no, amount, payment_method || "cash", type || "payment", payment_date]
    );

    await client.query("COMMIT");
    await updatePaymentStatus(ref_no);

    res.json({
      success: true,
      message: "Payment saved successfully"
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.json({
      success: false,
      error: err.message
    });
  } finally {
    client.release();
  }
});

/* =====================================================
   DELETE CUSTOMER PAYMENT
===================================================== */
router.delete("/delete/:id", async (req, res) => {
  try {
    const { password } = req.body;

    const passCheck = await db.query("SELECT password_val FROM system_passwords WHERE key_name = $1", ['delete_customer_payment']);
    if (passCheck.rows.length === 0) {
      return res.json({ success: false, error: "System password not configured in database!" });
    }

    const dbPassword = passCheck.rows[0].password_val;
    if (password !== dbPassword) {
      return res.json({ success: false, error: "Wrong password" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const payRes = await client.query("SELECT ref_no FROM customer_payments WHERE id=$1", [req.params.id]);
      if (payRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.json({ success: false, error: "Payment not found" });
      }
      const ref_no = payRes.rows[0].ref_no;

      await client.query("DELETE FROM customer_payments WHERE id=$1", [req.params.id]);
      await client.query("COMMIT");

      await updatePaymentStatus(ref_no);
      res.json({ success: true, message: "Payment deleted" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   EDIT CUSTOMER PAYMENT
===================================================== */
router.put("/edit/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { password, amount, payment_date, payment_method, type } = req.body;

    if (!id || isNaN(id)) {
      return res.json({ success: false, error: "Invalid payment ID" });
    }

    if (!amount || Number(amount) <= 0) {
      return res.json({ success: false, error: "Amount must be greater than zero" });
    }

    if (!payment_date) {
      return res.json({ success: false, error: "Payment date is required" });
    }

    const passCheck = await db.query(
      "SELECT password_val FROM system_passwords WHERE key_name = $1",
      ["delete_customer_payment"]
    );

    if (passCheck.rows.length === 0) {
      return res.json({ success: false, error: "Authorization password not configured in system_passwords table!" });
    }

    if (password !== passCheck.rows[0].password_val) {
      return res.json({ success: false, error: "Wrong Password!" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const payRes = await client.query(
        "SELECT ref_no FROM customer_payments WHERE id = $1",
        [id]
      );

      if (payRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.json({ success: false, error: "Payment record not found!" });
      }

      const ref_no = payRes.rows[0].ref_no;

      await client.query(
        `
        UPDATE customer_payments
        SET amount = $1, payment_date = $2, payment_method = $3, type = $4
        WHERE id = $5
        `,
        [amount, payment_date, payment_method || "Bank", type || "payment", id]
      );

      await client.query("COMMIT");

      await updatePaymentStatus(ref_no);

      res.json({ success: true, message: "Payment entry updated successfully" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error("CUSTOMER LEDGER EDIT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;