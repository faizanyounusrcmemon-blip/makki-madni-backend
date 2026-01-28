const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   LOAD PURCHASE (SAVE + EDIT AUTO) ✅ SUPPLIER INCLUDED
===================================================== */
router.get("/load/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;
    let rows = [];

    /* =========================
       CHECK EDIT MODE
    ========================= */
    const chk = await db.query(
      `SELECT COUNT(*) FROM purchase_entries 
       WHERE ref_no=$1 AND is_deleted=false`,
      [ref_no]
    );
    const isEdit = Number(chk.rows[0].count) > 0;

    /* =========================
       FETCH SALES DATA BASED ON REF PREFIX
    ========================= */
    let salesRow = null;
    if (ref_no.startsWith("PKG-")) {
      const q = await db.query(
        `SELECT * FROM bookings WHERE ref_no=$1 AND is_deleted=false`,
        [ref_no]
      );
      if (!q.rows.length) return res.json({ success:false, error:"Package not found" });
      salesRow = q.rows[0];

      // TICKETS
      if (salesRow.adult_count > 0)
        rows.push({
          item: "Ticket – Adult",
          sale_sar: salesRow.adult_count * salesRow.adult_rate,
          sale_rate: salesRow.flight_sar_rate || 0,
          sale_pkr: (salesRow.adult_count * salesRow.adult_rate) * (salesRow.flight_sar_rate || 0),
        });

      if (salesRow.child_count > 0)
        rows.push({
          item: "Ticket – Child",
          sale_sar: salesRow.child_count * salesRow.child_rate,
          sale_rate: salesRow.flight_sar_rate || 0,
          sale_pkr: (salesRow.child_count * salesRow.child_rate) * (salesRow.flight_sar_rate || 0),
        });

      if (salesRow.infant_count > 0)
        rows.push({
          item: "Ticket – Infant",
          sale_sar: salesRow.infant_count * salesRow.infant_rate,
          sale_rate: salesRow.flight_sar_rate || 0,
          sale_pkr: (salesRow.infant_count * salesRow.infant_rate) * (salesRow.flight_sar_rate || 0),
        });

      // HOTELS
      if (Array.isArray(salesRow.hotels)) {
        salesRow.hotels.forEach((h,i)=>{
          rows.push({
            item: `Hotel ${i+1} - ${h.hotel||""}`,
            sale_sar: Number(h.total) || 0,
            sale_rate: salesRow.hotel_sar_rate || 0,
            sale_pkr: (Number(h.total)||0) * (salesRow.hotel_sar_rate||0)
          });
        });
      }

      // VISA
      if (salesRow.visa_persons > 0) {
        const persons = salesRow.visa_persons;
        const sar =
          salesRow.visa_total || persons * salesRow.visa_rate;

        rows.push({
          item: `Visa (${persons} Person${persons > 1 ? "s" : ""})`,
          sale_sar: sar,
          sale_rate: salesRow.visa_sar_rate || 0,
          sale_pkr: sar * (salesRow.visa_sar_rate || 0),
        });
      }
      // TRANSPORT
      if (Array.isArray(salesRow.transport)) {
        salesRow.transport.forEach((t,i)=>{
          const base = `Transport ${i+1}`;
          const label = t.text || t.route || t.description || "";
          const sar = Number(t.amount) || 0;
          rows.push({
            item: label ? `${base} - ${label}` : base, // ✅ item میں label include کریں
            sale_sar: sar,
            sale_rate: salesRow.transport_sar_rate || 0,
            sale_pkr: sar * (salesRow.transport_sar_rate || 0)
          });
        });
      }

      // ZIYARAT
      if (Array.isArray(salesRow.ziyarat)) {
        salesRow.ziyarat.forEach((t,i)=>{
          const base = `Ziyarat ${i+1}`;
          const label = t.text || t.route || t.description || "";
          const sar = Number(t.amount) || 0;
          rows.push({
            item: label ? `${base} - ${label}` : base, // ✅ item میں label include کریں
            sale_sar: sar,
            sale_rate: salesRow.ziyarat_sar_rate || 0,
            sale_pkr: sar * (salesRow.ziyarat_sar_rate || 0)
          });
        });
      }
    }

    /* =========================
       HOTEL ONLY (HOT-)
    ========================= */
    else if (ref_no.startsWith("HOT-")) {
      const q = await db.query(
        `
        SELECT hotel_name, hotel_total, sar_rate
        FROM hotels
        WHERE ref_no=$1 AND is_deleted=false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Hotel not found" });

      const r = q.rows[0];

      (r.hotel_name || []).forEach((name, i) => {
        rows.push({
          item: `Hotel ${i + 1} - ${name}`,
          sale_sar: Number(r.hotel_total[i]) || 0,
          sale_rate: r.sar_rate || 0,
          sale_pkr: (Number(r.hotel_total[i]) || 0) * (r.sar_rate || 0),
        });
      });
    }

    /* =========================
       VISA ONLY (VISA-)
    ========================= */
    else if (ref_no.startsWith("VISA-")) {
      const q = await db.query(
        `
        SELECT total_sar, pkr_rate
        FROM visa
        WHERE ref_no=$1 AND is_deleted=false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Visa not found" });

      const r = q.rows[0];

      rows.push({
        item: "Visa",
        sale_sar: Number(r.total_sar) || 0,
        sale_rate: r.pkr_rate || 0,
        sale_pkr: (Number(r.total_sar) || 0) * (r.pkr_rate || 0),
      });
    }

    /* =========================
       TRANSPORT ONLY (TRN-)
    ========================= */
    else if (ref_no.startsWith("TRN-")) {
      const q = await db.query(
        `
        SELECT rows, pkr_rate
        FROM transport
        WHERE ref_no=$1 AND is_deleted=false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Transport not found" });

      const r = q.rows[0];

      if (Array.isArray(r.rows)) {
        r.rows.forEach((t, i) => {
          const baseItem = `Transport ${i + 1}`;
          const label = t.description || t.text || t.route || "";

          const sar = Number(t.sar) || 0;     // ✅ FIX HERE
          const rate = Number(r.pkr_rate) || 0;

          rows.push({
            item: label ? `${baseItem} - ${label}` : baseItem, // ✅ include route/text in item
            sale_sar: sar,        // ✅ now works
            sale_rate: rate,
            sale_pkr: sar * rate,
          });
        });
      }
    }

        /* =========================
          ZIYARAT ONLY (ZIY-)
         ========================= */
    else if (ref_no.startsWith("ZIY-")) {
      const q = await db.query(
        `
        SELECT rows, pkr_rate
        FROM ziyarat
        WHERE ref_no=$1 AND is_deleted=false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Ziyarat not found" });

      const r = q.rows[0];

      if (Array.isArray(r.rows)) {
        r.rows.forEach((t, i) => {
          const baseItem = `Ziyarat ${i + 1}`;
          const label = t.description || t.text || t.route || "";

          const sar = Number(t.sar) || 0;     // ✅ FIX HERE
          const rate = Number(r.pkr_rate) || 0;

          rows.push({
            item: label ? `${baseItem} - ${label}` : baseItem, // ✅ include route/text in item
            sale_sar: sar,        // ✅ now works
            sale_rate: rate,
            sale_pkr: sar * rate,
          });
        });
      }
    }

    /* =========================
       TICKETING ONLY (TIC-)
    ========================= */
    else if (ref_no.startsWith("TIC-")) {
      const q = await db.query(
        `
        SELECT adult_qty, adult_rate,
               child_qty, child_rate,
               infant_qty, infant_rate,
               pkr_rate
        FROM ticketing
        WHERE ref_no=$1 AND is_deleted=false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Ticket not found" });

      const r = q.rows[0];

      if (r.adult_qty > 0)
        rows.push({
          item: "Ticket – Adult",
          sale_sar: r.adult_qty * r.adult_rate,
          sale_rate: r.pkr_rate,
          sale_pkr: r.adult_qty * r.adult_rate * r.pkr_rate,
        });

      if (r.child_qty > 0)
        rows.push({
          item: "Ticket – Child",
          sale_sar: r.child_qty * r.child_rate,
          sale_rate: r.pkr_rate,
          sale_pkr: r.child_qty * r.child_rate * r.pkr_rate,
        });

      if (r.infant_qty > 0)
        rows.push({
          item: "Ticket – Infant",
          sale_sar: r.infant_qty * r.infant_rate,
          sale_rate: r.pkr_rate,
          sale_pkr: r.infant_qty * r.infant_rate * r.pkr_rate,
        });
    } else {
      return res.json({ success: false, error: "Invalid Ref No" });
    }



    /* =========================
       MERGE PURCHASE (EDIT) ✅
       SHOW BLANK FOR EMPTY SAR/RATE
    ========================= */
    const p = await db.query(
      `SELECT * FROM purchase_entries
       WHERE ref_no=$1 AND is_deleted=false`,
      [ref_no]
    );

    rows = rows.map(r => {
      // Base item for matching (remove any ' - ' label part)
      const baseItem = r.item.split(' - ')[0];

      // Try to find matching purchase entry
      const x = p.rows.find(p => 
        p.item === r.item || p.item === baseItem
      );

      return {
        ...r,
        purchase_sar: x?.purchase_sar ?? "",     // EMPTY if null
        purchase_rate: x?.purchase_rate ?? "",   // EMPTY if null
        purchase_pkr: x?.purchase_pkr ?? 0,
        profit: x?.profit ?? 0,
        supplier_code: x?.supplier_code ?? "",
        supplier_name: x?.supplier_name ?? ""
      };
    });

    res.json({ success:true, is_edit:isEdit, rows });

  } catch(err){
    console.error("PURCHASE LOAD ERROR:", err);
    res.json({ success:false, error: err.message });
  }
});

/* =====================================================
   SAVE PURCHASE (UPSERT) ✅ SUPPLIER INCLUDED
===================================================== */
router.post("/save", async (req, res) => {
  try {
    const { ref_no, items } = req.body;

    if (!ref_no || !Array.isArray(items)) {
      return res.json({ success: false, error: "Invalid payload" });
    }

    const unique = [];
    const seen = new Set();

    for (const r of items) {
      if (!r.item) continue;
      const key = r.item.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(r);
    }

    for (const r of unique) {
      await db.query(
        `
        INSERT INTO purchase_entries (
          ref_no, item,
          sale_sar, sale_rate, sale_pkr,
          purchase_sar, purchase_rate, purchase_pkr,
          profit,
          supplier_code,
          supplier_name,
          is_deleted
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false)
        ON CONFLICT (ref_no, item)
        DO UPDATE SET
          sale_sar       = EXCLUDED.sale_sar,
          sale_rate      = EXCLUDED.sale_rate,
          sale_pkr       = EXCLUDED.sale_pkr,
          purchase_sar   = EXCLUDED.purchase_sar,
          purchase_rate  = EXCLUDED.purchase_rate,
          purchase_pkr   = EXCLUDED.purchase_pkr,
          profit         = EXCLUDED.profit,
          supplier_code  = EXCLUDED.supplier_code,
          supplier_name  = EXCLUDED.supplier_name,
          is_deleted     = false
        `,
        [
          ref_no,
          r.item,
          r.sale_sar || 0,
          r.sale_rate || 0,
          r.sale_pkr || 0,
          r.purchase_sar || 0,
          r.purchase_rate || 0,
          r.purchase_pkr || 0,
          r.profit || 0,
          r.supplier_code || "",
          r.supplier_name || "",
        ]
      );
    }

    res.json({ success: true, message: "✅ Purchase saved / updated" });

  } catch (err) {
    console.error("PURCHASE UPSERT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   PURCHASE LIST (WITH CUSTOMER NAME)
===================================================== */
router.get("/list", async (req, res) => {
  try {
    const { from, to, ref } = req.query;

    let where = `WHERE p.is_deleted = false`;
    let params = [];
    let i = 1;

    // DATE FILTER
    if (from && to) {
      where += ` AND DATE(p.created_at) BETWEEN $${i} AND $${i + 1}`;
      params.push(from, to);
      i += 2;
    }

    // 🔥 PARTIAL SEARCH (REF NO OR CUSTOMER NAME)
    if (ref) {
      where += `
        AND (
          p.ref_no ILIKE $${i}
          OR s.customer_name ILIKE $${i}
        )
      `;
      params.push(`%${ref}%`);
      i += 1;
    }

    const q = await db.query(
      `
      SELECT
        p.ref_no,
        MAX(s.customer_name) AS customer_name,
        SUM(p.sale_pkr)      AS sale_pkr,
        SUM(p.purchase_pkr)  AS purchase_pkr,
        SUM(p.profit)        AS profit,
        MIN(p.created_at)    AS created_at
      FROM purchase_entries p
      LEFT JOIN (
        SELECT ref_no, customer_name FROM bookings
        UNION ALL
        SELECT ref_no, customer_name FROM hotels
        UNION ALL
        SELECT ref_no, customer_name FROM visa
        UNION ALL
        SELECT ref_no, customer_name FROM ticketing
        UNION ALL
        SELECT ref_no, customer_name FROM transport
        UNION ALL
        SELECT ref_no, customer_name FROM ziyarat
      ) s ON s.ref_no = p.ref_no
      ${where}
      GROUP BY p.ref_no
      ORDER BY created_at DESC
      `,
      params
    );

    res.json({ success: true, rows: q.rows });

  } catch (err) {
    console.error("PURCHASE LIST ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});


/* =====================================================
   PURCHASE SOFT DELETE WITH PAYMENT CHECK
===================================================== */
router.delete("/delete/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;
    const { password } = req.body; // 🔐 password frontend se aayega

    // 🔒 PASSWORD CHECK
    if (password !== "786") {
      return res.json({
        success: false,
        error: "Invalid password",
      });
    }

    // ===============================
    // CHECK IF PAYMENT EXISTS
    // ===============================
    const paymentCheck = await db.query(
      `SELECT SUM(amount) AS total
       FROM purchase_payments
       WHERE ref_no = $1 AND is_deleted = false`,
      [ref_no]
    );

    if (paymentCheck.rows[0].total > 0) {
      return res.json({
        success: false,
        error: "❌ Cannot delete purchase. Payment has been received for this ref. Delete payments first."
      });
    }

    // ===============================
    // SOFT DELETE PURCHASE ENTRIES
    // ===============================
    const q = await db.query(
      `
      UPDATE purchase_entries
      SET is_deleted = true
      WHERE ref_no = $1
      RETURNING ref_no
      `,
      [ref_no]
    );

    if (!q.rows.length) {
      return res.json({
        success: false,
        error: "Purchase not found",
      });
    }

    res.json({ success: true, message: "✅ Purchase soft deleted successfully" });

  } catch (err) {
    console.error("PURCHASE DELETE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});


/* =====================================================
   PURCHASE DETAIL ✅ SUPPLIER INCLUDED
===================================================== */
router.get("/detail/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;

    const q = await db.query(
      `
      SELECT
        p.ref_no,
        p.item,
        p.sale_sar,
        p.sale_rate,
        p.sale_pkr,
        p.purchase_sar,
        p.purchase_rate,
        p.purchase_pkr,
        p.profit,
        p.supplier_code,
        p.supplier_name,
        p.created_at,
        s.customer_name
      FROM purchase_entries p
      LEFT JOIN (
        SELECT ref_no, customer_name FROM bookings
        UNION ALL
        SELECT ref_no, customer_name FROM hotels
        UNION ALL
        SELECT ref_no, customer_name FROM visa
        UNION ALL
        SELECT ref_no, customer_name FROM ticketing
        UNION ALL
        SELECT ref_no, customer_name FROM transport
        UNION ALL
        SELECT ref_no, customer_name FROM ziyarat
      ) s ON s.ref_no = p.ref_no
      WHERE p.ref_no=$1 AND p.is_deleted=false
      ORDER BY p.item
      `,
      [ref_no]
    );

    if (!q.rows.length) {
      return res.json({ success: false, error: "Purchase entry not found" });
    }

    const totals = q.rows.reduce(
      (a, r) => {
        a.sale_pkr += Number(r.sale_pkr || 0);
        a.purchase_pkr += Number(r.purchase_pkr || 0);
        a.profit += Number(r.profit || 0);
        return a;
      },
      { sale_pkr: 0, purchase_pkr: 0, profit: 0 }
    );

    res.json({ success: true, rows: q.rows, totals });

  } catch (err) {
    console.error("PURCHASE DETAIL ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

     


/* =====================================================
   PENDING + PARTIAL PURCHASE (FINAL SAFE – WITH CUSTOMER NAME)
===================================================== */
router.get("/pending", async (req, res) => {
  try {
    // 🔹 refs + customer_name from all sales tables
    const sales = await db.query(`
      SELECT
        ref_no,
        MAX(customer_name) AS customer_name,
        MIN(booking_date)  AS created_at
      FROM (
        SELECT ref_no, customer_name, booking_date
        FROM bookings
        WHERE is_deleted=false

        UNION ALL

        SELECT ref_no, customer_name, booking_date
        FROM hotels
        WHERE is_deleted=false

        UNION ALL

        SELECT ref_no, customer_name, booking_date
        FROM visa
        WHERE is_deleted=false

        UNION ALL

        SELECT ref_no, customer_name, booking_date
        FROM ticketing
        WHERE is_deleted=false

        UNION ALL

        SELECT ref_no, customer_name, booking_date
        FROM transport
        WHERE is_deleted=false

        UNION ALL

        SELECT ref_no, customer_name, booking_date
        FROM ziyarat
        WHERE is_deleted=false
      ) s
      GROUP BY ref_no
    `);

    // 🔹 purchase completeness check
    const purchase = await db.query(`
      SELECT
        ref_no,
        BOOL_AND(
          purchase_sar > 0 AND purchase_rate > 0
        ) AS completed
      FROM purchase_entries
      WHERE is_deleted=false
      GROUP BY ref_no
    `);

    // 🔹 map for quick lookup
    const map = {};
    purchase.rows.forEach(r => {
      map[r.ref_no] = r.completed; // true / false
    });

    const result = [];

    for (const r of sales.rows) {
      const done = map[r.ref_no];

      // 🔴 Purchase not started
      if (done === undefined) {
        result.push({
          ref_no: r.ref_no,
          customer_name: r.customer_name || "",
          created_at: r.created_at,
          status: "PENDING",
          note: "Purchase not started"
        });
        continue;
      }

      // 🟡 Purchase incomplete
      if (done === false) {
        result.push({
          ref_no: r.ref_no,
          customer_name: r.customer_name || "",
          created_at: r.created_at,
          status: "PARTIAL",
          note: "Purchase incomplete"
        });
      }
    }

    return res.json({
      success: true,
      rows: result
    });

  } catch (err) {
    console.error("PENDING PURCHASE ERROR:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* =====================================================
   PURCHASE ROWS WHERE SUPPLIER IS MISSING (ROW LEVEL)
===================================================== */
router.get("/missing-supplier", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        p.id,
        p.ref_no,
        p.supplier_name,
        p.supplier_code,
        (p.purchase_sar * p.purchase_rate) AS row_amount
      FROM purchase_entries p
      WHERE p.is_deleted = false
        AND p.purchase_sar > 0
        AND p.purchase_rate > 0
        AND (
          p.supplier_name IS NULL OR p.supplier_name = ''
          OR
          p.supplier_code IS NULL OR p.supplier_code = ''
        )
      ORDER BY p.ref_no
    `);

    /* ================= CUSTOMER NAME ================= */
    const customers = await db.query(`
      SELECT ref_no, MAX(customer_name) AS customer_name
      FROM (
        SELECT ref_no, customer_name FROM bookings WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_name FROM hotels WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_name FROM visa WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_name FROM ticketing WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_name FROM transport WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_name FROM ziyarat WHERE is_deleted=false
      ) x
      GROUP BY ref_no
    `);

    const customerMap = {};
    customers.rows.forEach(r => {
      customerMap[r.ref_no] = r.customer_name;
    });

    const rows = result.rows.map(r => ({
      id: r.id,
      ref_no: r.ref_no,
      customer_name: customerMap[r.ref_no] || "",
      supplier_name: r.supplier_name,
      supplier_code: r.supplier_code,
      row_amount: r.row_amount || 0,
      status: "COMPLETE",
      note: "Supplier missing in this row"
    }));

    res.json({ success: true, rows });

  } catch (err) {
    console.error("MISSING SUPPLIER ROW ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});



module.exports = router;









