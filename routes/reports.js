const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   🔹 COMMON CUSTOMER SOURCE (ALL MODULES)
===================================================== */
const CUSTOMER_SQL = `
  SELECT ref_no, customer_name FROM bookings
  UNION ALL
  SELECT ref_no, customer_name FROM hotels
  UNION ALL
  SELECT ref_no, customer_name FROM visa
  UNION ALL
  SELECT ref_no, customer_name FROM card
  UNION ALL
  SELECT ref_no, customer_name FROM groups
  UNION ALL
  SELECT ref_no, customer_name FROM ticketing
  UNION ALL
  SELECT ref_no, customer_name FROM transport
  UNION ALL
  SELECT ref_no, customer_name FROM ziyarat
`;


/* =====================================================
   ✅ SALE ADJUSTMENT REPORT (DYNAMIC REG & WALK-IN FIX)
===================================================== */
router.get("/sale-adjustments", async (req, res) => {
  try {
    const sql = `
      WITH sales AS (
        SELECT ref_no, customer_code, total_pkr FROM bookings WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_code, total_pkr FROM hotels WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_code, total_pkr FROM visa WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_code, total_pkr FROM card WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_code, total_pkr FROM groups WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_code, total_pkr FROM ticketing WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_code, total_pkr FROM transport WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, customer_code, total_pkr FROM ziyarat WHERE is_deleted=false
      ),
      
      -- Walk-in customers ki sale lookup by ref_no
      sale_sum_walkin AS (
        SELECT ref_no, SUM(total_pkr) AS amount
        FROM sales
        GROUP BY ref_no
      ),

      -- Registered customers ki sale lookup by customer_code
      sale_sum_registered AS (
        SELECT customer_code, SUM(total_pkr) AS amount
        FROM sales
        WHERE customer_code IS NOT NULL AND customer_code != ''
        GROUP BY customer_code
      )

      SELECT
        cp.id,
        cp.payment_date AS date,
        cp.ref_no,
        cp.payment_method,
        
        -- DYNAMIC NAME LOOKUP
        COALESCE(
          CASE 
            WHEN cp.ref_no LIKE 'CUST-%' THEN
              (SELECT customer_name FROM (
                 SELECT customer_name FROM bookings WHERE customer_code = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM hotels WHERE customer_code = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM visa WHERE customer_code = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM card WHERE customer_code = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM groups WHERE customer_code = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM ticketing WHERE customer_code = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM transport WHERE customer_code = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM ziyarat WHERE customer_code = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
               ) reg_cust LIMIT 1)
            ELSE
              (SELECT customer_name FROM (
                 SELECT customer_name FROM bookings WHERE ref_no = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM hotels WHERE ref_no = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM visa WHERE ref_no = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM card WHERE ref_no = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM groups WHERE ref_no = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM ticketing WHERE ref_no = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM transport WHERE ref_no = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
                 UNION ALL
                 SELECT customer_name FROM ziyarat WHERE ref_no = cp.ref_no AND customer_name IS NOT NULL AND customer_name != ''
               ) walkin_cust LIMIT 1)
          END, 'Unknown Customer'
        ) AS customer_name,

        -- DYNAMIC TOTAL SALE AMOUNT LOOKUP
        ROUND(COALESCE(
          CASE 
            WHEN cp.ref_no LIKE 'CUST-%' THEN ss_reg.amount
            ELSE ss_walk.amount
          END, 0)::numeric, 0) AS amount,

        ROUND(COALESCE(cp.amount, 0)::numeric, 0) AS adjustment_amount,

        ROUND((COALESCE(
          CASE 
            WHEN cp.ref_no LIKE 'CUST-%' THEN ss_reg.amount
            ELSE ss_walk.amount
          END, 0) - COALESCE(cp.amount, 0))::numeric, 0) AS net_amount

      FROM customer_payments cp

      -- Left join with Walk-in Sales
      LEFT JOIN sale_sum_walkin ss_walk
        ON ss_walk.ref_no = cp.ref_no

      -- Left join with Registered Sales
      LEFT JOIN sale_sum_registered ss_reg
        ON ss_reg.customer_code = cp.ref_no

      WHERE cp.type = 'adjustment'
      ORDER BY cp.payment_date DESC, cp.id DESC
    `;

    const { rows } = await db.query(sql);
    res.json({ success: true, rows });

  } catch (err) {
    console.error("SALE ADJUSTMENT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* =========================================
   SUPPLIER ADJUSTMENT (WITH DATE)
========================================= */
router.get("/supplier-adjustment-only", async (req, res) => {
  try {
    const { from, to } = req.query;

    let dateFilter = "";
    let params = [];

    if (from && to) {
      params.push(from);
      params.push(to);
      dateFilter = ` AND sp.payment_date BETWEEN $1 AND $2 `;
    }

    const q = await db.query(
      `
      SELECT
        s.id AS supplier_id,
        s.supplier_code,
        s.supplier_name,
        sp.payment_date,
        sp.amount AS adjustment_amount

      FROM suppliers s
      JOIN supplier_payments sp
        ON sp.supplier_id = s.id

      WHERE (
        LOWER(sp.payment_method) = 'adjustment'
        OR LOWER(sp.type) = 'adjustment'
      )
      ${dateFilter}

      ORDER BY sp.payment_date DESC
      `,
      params
    );

    res.json({
      success: true,
      rows: q.rows
    });

  } catch (err) {
    console.error("SUPPLIER ADJUSTMENT ERROR:", err);
    res.status(500).json({ success:false, error: err.message });
  }
});

/* =====================================================
   1. GET ALL REPORTS (INCLUDES CARD & GROUPS)
===================================================== */
router.get("/all", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT 'Packages' AS type, id, ref_no, customer_name, customer_code, booking_date, total_pkr, is_final
      FROM bookings WHERE is_deleted=false

      UNION ALL
      SELECT 'Ticketing', id, ref_no, customer_name, customer_code, booking_date, total_pkr, false AS is_final
      FROM ticketing WHERE is_deleted=false

      UNION ALL
      SELECT 'Hotels', id, ref_no, customer_name, customer_code, booking_date, total_pkr, false AS is_final
      FROM hotels WHERE is_deleted=false

      UNION ALL
      SELECT 'Visa', id, ref_no, customer_name, customer_code, booking_date, total_pkr, false AS is_final
      FROM visa WHERE is_deleted=false

      UNION ALL
      SELECT 'Transport', id, ref_no, customer_name, customer_code, booking_date, total_pkr, false AS is_final
      FROM transport WHERE is_deleted=false

      UNION ALL
      SELECT 'Ziyarat', id, ref_no, customer_name, customer_code, booking_date, total_pkr, false AS is_final
      FROM ziyarat WHERE is_deleted=false

      UNION ALL
      SELECT 'Card', id, ref_no, customer_name, customer_code, booking_date, total_pkr, false AS is_final
      FROM card WHERE is_deleted=false

      UNION ALL
      SELECT 'Groups', id, ref_no, customer_name, customer_code, booking_date, total_pkr, false AS is_final
      FROM groups WHERE is_deleted=false

      ORDER BY booking_date DESC
    `);
    res.json(q.rows);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================
   2. GET PENDING SALES REPORT (INCLUDES CARD & GROUPS)
===================================================== */
router.get("/pending", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT 'Packages' AS type, id, ref_no, customer_name, customer_code, booking_date, total_pkr
      FROM bookings WHERE is_deleted=false AND (is_final=false OR is_final IS NULL)

      UNION ALL
      SELECT 'Ticketing', id, ref_no, customer_name, customer_code, booking_date, total_pkr
      FROM ticketing WHERE is_deleted=false

      UNION ALL
      SELECT 'Hotels', id, ref_no, customer_name, customer_code, booking_date, total_pkr
      FROM hotels WHERE is_deleted=false

      UNION ALL
      SELECT 'Visa', id, ref_no, customer_name, customer_code, booking_date, total_pkr
      FROM visa WHERE is_deleted=false

      UNION ALL
      SELECT 'Transport', id, ref_no, customer_name, customer_code, booking_date, total_pkr
      FROM transport WHERE is_deleted=false

      UNION ALL
      SELECT 'Ziyarat', id, ref_no, customer_name, customer_code, booking_date, total_pkr
      FROM ziyarat WHERE is_deleted=false

      UNION ALL
      SELECT 'Card', id, ref_no, customer_name, customer_code, booking_date, total_pkr
      FROM card WHERE is_deleted=false

      UNION ALL
      SELECT 'Groups', id, ref_no, customer_name, customer_code, booking_date, total_pkr
      FROM groups WHERE is_deleted=false

      ORDER BY booking_date DESC
    `);
    res.json(q.rows);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================
   3. FINALIZE SALE API WITH PASSWORD VERIFICATION
===================================================== */
router.post("/finalize", async (req, res) => {
  const { type, ref_no, password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: "Password is required" });
  }

  try {
    const passQuery = await db.query(
      `SELECT password_val FROM public.system_passwords WHERE key_name = 'finalize_pass' LIMIT 1`
    );

    if (passQuery.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Finalize password not configured in system." });
    }

    if (password !== passQuery.rows[0].password_val) {
      return res.status(401).json({ success: false, message: "Invalid Password!" });
    }

    const tableMap = {
      Packages: "bookings",
      Hotels: "hotels",
      Ticketing: "ticketing",
      Transport: "transport",
      Ziyarat: "ziyarat",
      Visa: "visa",
      Card: "card",
      Groups: "groups",
    };

    const table = tableMap[type];

    if (!table || !ref_no) {
      return res.status(400).json({ success: false, message: "Invalid Request Parameters" });
    }

    await db.query(`UPDATE ${table} SET is_final = true WHERE ref_no = $1`, [ref_no]);

    res.json({ success: true, message: "Sale finalized successfully!" });
  } catch (err) {
    console.error("FINALIZE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================
   4. UNFINALIZE SALE API (RETURN TO PENDING WITH PASSWORD)
===================================================== */
router.post("/unfinalize", async (req, res) => {
  const { type, ref_no, password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: "Password is required" });
  }

  try {
    const passQuery = await db.query(
      `SELECT password_val FROM public.system_passwords WHERE key_name = 'unfinalize_pass' LIMIT 1`
    );

    if (passQuery.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Unfinalize password not configured in system." });
    }

    if (password !== passQuery.rows[0].password_val) {
      return res.status(401).json({ success: false, message: "Invalid Password!" });
    }

    const tableMap = {
      Packages: "bookings",
      Hotels: "hotels",
      Ticketing: "ticketing",
      Transport: "transport",
      Ziyarat: "ziyarat",
      Visa: "visa",
      Card: "card",
      Groups: "groups",
    };

    const table = tableMap[type];

    if (!table || !ref_no) {
      return res.status(400).json({ success: false, message: "Invalid Parameters" });
    }

    await db.query(`UPDATE ${table} SET is_final = false WHERE ref_no = $1`, [ref_no]);

    res.json({ success: true, message: "Sale returned to Pending status successfully!" });
  } catch (err) {
    console.error("UNFINALIZE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================
   🔹 SUPPLIER WISE PURCHASE REPORT
   - Fetch from purchase_entries
   - Supplier list from suppliers table
===================================================== */
router.get("/supplier-purchase", async (req, res) => {
  try {
    const query = `
      SELECT
        p.id,
        p.ref_no,
        p.item,

        /* SALE */
        p.sale_sar,
        p.sale_rate,
        p.sale_pkr,

        /* PURCHASE */
        p.purchase_sar,
        p.purchase_rate,
        p.purchase_pkr,

        /* PROFIT */
        (COALESCE(p.sale_pkr,0) - COALESCE(p.purchase_pkr,0)) AS profit,

        p.created_at AS booking_date,
        s.supplier_name
      FROM purchase_entries p
      LEFT JOIN suppliers s
        ON s.supplier_code = p.supplier_code
      WHERE p.is_deleted = false
        AND (p.purchase_sar > 0 OR p.purchase_rate > 0)  -- ✅ یہ شرط
      ORDER BY p.created_at DESC
    `;

    const { rows } = await db.query(query);

    const sup = await db.query(`
      SELECT supplier_name
      FROM suppliers
      WHERE is_deleted = false
      ORDER BY supplier_name
    `);

    res.json({
      success: true,
      rows,
      suppliers: ["ALL", ...sup.rows.map(s => s.supplier_name)]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});




/* =====================================================
   🔐 AUTHORITY CONTROL FOR ALLREPORTS TODAY (DATABASE PERSISTED)
===================================================== */

// Helper function to get days from DB (Aapki new authority_settings table ke mutabik)
async function getAccessDaysFromDB() {
  try {
    // 🔍 public.authority_settings table se 'allowed_access_days' ka record uthaya
    const res = await db.query(
      "SELECT value FROM public.authority_settings WHERE key = 'allowed_access_days'"
    );
    
    if (res.rows.length > 0 && res.rows[0].value !== null) {
      return parseInt(res.rows[0].value, 10) || 7;
    }
    return 7; // Database fallback agar setting row na mile
  } catch (err) {
    console.error("Error fetching access days from DB:", err);
    return 7; // Error code fallback
  }
}

/* =====================================================
   🔍 GET CURRENT AUTHORITY DAYS FOR BADGE DISPLAY
===================================================== */
router.get("/authority/get-days", async (req, res) => {
  try {
    const currentDays = await getAccessDaysFromDB();
    res.json({ success: true, days: currentDays });
  } catch (err) {
    console.error("GET AUTHORITY DAYS ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================
   ✅ UPDATE AUTHORITY DAYS (system_passwords se lookup)
===================================================== */
router.post("/authority/update-days", async (req, res) => {
  const { days, password } = req.body;
  
  if (!days || !password) {
    return res.status(400).json({ success: false, message: "Missing required attributes!" });
  }

  try {
    // 🔍 FIX: Seedha public.system_passwords table se 'authority_pass' ka password_val check karega
    const passCheck = await db.query(
      "SELECT password_val FROM public.system_passwords WHERE key_name = 'authority_pass'"
    );
    
    if (passCheck.rows.length === 0) {
      return res.status(444).json({ success: false, message: "Authority password key setup not found in DB!" });
    }

    const currentAuthorityPass = passCheck.rows[0].password_val;

    // Frontend se aaye password ko DB wale password ('786f') se match karega
    if (password !== currentAuthorityPass) {
      return res.status(403).json({ success: false, message: "Invalid Authority Security Password! 😎" });
    }

    // Naye days ko public.authority_settings table mein save karega
    await db.query(
      `INSERT INTO public.authority_settings (key, value) 
       VALUES ('allowed_access_days', $1) 
       ON CONFLICT (key) 
       DO UPDATE SET value = $1`,
      [parseInt(days, 10)]
    );

    res.json({ success: true, message: "Authority timeline configuration updated successfully." });
  } catch (err) {
    console.error("UPDATE AUTHORITY DAYS ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================
   🔹 3. GET RESTRICTED DATA FOR EMPLOYEES
===================================================== */
router.get("/today-restricted", async (req, res) => {
  try {
    // New dynamic database values ke sath filtered rows uthayega
    const currentDays = await getAccessDaysFromDB(); 

    const sql = `
      SELECT 'Packages' AS type, id, ref_no, customer_name, booking_date, total_pkr, created_at
      FROM bookings WHERE is_deleted=false AND created_at >= NOW() - (INTERVAL '1 day' * $1)
      UNION ALL
      SELECT 'Ticketing', id, ref_no, customer_name, booking_date, total_pkr, created_at
      FROM ticketing WHERE is_deleted=false AND created_at >= NOW() - (INTERVAL '1 day' * $1)
      UNION ALL
      SELECT 'Hotels', id, ref_no, customer_name, booking_date, total_pkr, created_at
      FROM hotels WHERE is_deleted=false AND created_at >= NOW() - (INTERVAL '1 day' * $1)
      UNION ALL
      SELECT 'Visa', id, ref_no, customer_name, booking_date, total_pkr, created_at
      FROM visa WHERE is_deleted=false AND created_at >= NOW() - (INTERVAL '1 day' * $1)
      UNION ALL
      SELECT 'Card', id, ref_no, customer_name, booking_date, total_pkr, created_at
      FROM card WHERE is_deleted=false AND created_at >= NOW() - (INTERVAL '1 day' * $1)
      UNION ALL
      SELECT 'Groups', id, ref_no, customer_name, booking_date, total_pkr, created_at
      FROM groups WHERE is_deleted=false AND created_at >= NOW() - (INTERVAL '1 day' * $1)
      UNION ALL
      SELECT 'Transport', id, ref_no, customer_name, booking_date, total_pkr, created_at
      FROM transport WHERE is_deleted=false AND created_at >= NOW() - (INTERVAL '1 day' * $1)
      UNION ALL
      SELECT 'Ziyarat', id, ref_no, customer_name, booking_date, total_pkr, created_at
      FROM ziyarat WHERE is_deleted=false AND created_at >= NOW() - (INTERVAL '1 day' * $1)
      ORDER BY created_at DESC
    `;
    
    const q = await db.query(sql, [currentDays]);
    res.json(q.rows);
  } catch (err) {
    console.error("RESTRICTED REPORTS ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* =====================================================
   🔹 CUSTOMER SALE DETAIL REPORT (DIRECT FROM SALES TABLES)
   - Fetches registered active customers from customers table
===================================================== */
router.get("/customer-sale", async (req, res) => {
  try {
    const rows = [];

    // 1. Registered Active Customers List (Code + Name)
    const custRes = await db.query(
      `SELECT customer_code AS code, name FROM customers WHERE is_deleted = false ORDER BY name ASC`
    );
    const customerList = custRes.rows; // [{ code: 'CUST-001', name: 'MARFANI TRAVELS' }, ...]

    // 2. BOOKINGS (PACKAGES)
    const pkgRes = await db.query(
      `SELECT * FROM bookings WHERE is_deleted = false ORDER BY booking_date DESC`
    );
    pkgRes.rows.forEach((s) => {
      let airline = "", from = "", to = "";
      if (Array.isArray(s.flights) && s.flights.length > 0) {
        const f = s.flights[0];
        airline = f.airline || f.airline_name || "";
        from = f.from || f.flight_from || "";
        to = f.to || f.flight_to || "";
      }
      const routeText = from && to ? `${from} → ${to}` : "";
      const extraInfo = [airline, routeText].filter(Boolean).join(" | ");

      const cCode = s.customer_code || "WALKIN";

      // Tickets
      if (s.adult_count > 0) {
        const sar = s.adult_count * s.adult_rate;
        const rate = Number(s.flight_sar_rate) || 0;
        rows.push({
          booking_date: s.booking_date,
          customer_code: cCode,
          customer_name: s.customer_name || "Walk-in Customer",
          ref_no: s.ref_no,
          item: `Ticket – Adult (${s.adult_count} Person${s.adult_count > 1 ? "s" : ""})${extraInfo ? " - " + extraInfo : ""}`,
          sale_sar: sar,
          sale_rate: rate,
          sale_pkr: sar * rate,
        });
      }
      if (s.child_count > 0) {
        const sar = s.child_count * s.child_rate;
        const rate = Number(s.flight_sar_rate) || 0;
        rows.push({
          booking_date: s.booking_date,
          customer_code: cCode,
          customer_name: s.customer_name || "Walk-in Customer",
          ref_no: s.ref_no,
          item: `Ticket – Child (${s.child_count} Person${s.child_count > 1 ? "s" : ""})${extraInfo ? " - " + extraInfo : ""}`,
          sale_sar: sar,
          sale_rate: rate,
          sale_pkr: sar * rate,
        });
      }
      if (s.infant_count > 0) {
        const sar = s.infant_count * s.infant_rate;
        const rate = Number(s.flight_sar_rate) || 0;
        rows.push({
          booking_date: s.booking_date,
          customer_code: cCode,
          customer_name: s.customer_name || "Walk-in Customer",
          ref_no: s.ref_no,
          item: `Ticket – Infant (${s.infant_count} Person${s.infant_count > 1 ? "s" : ""})${extraInfo ? " - " + extraInfo : ""}`,
          sale_sar: sar,
          sale_rate: rate,
          sale_pkr: sar * rate,
        });
      }

      // Hotels
      if (Array.isArray(s.hotels)) {
        s.hotels.forEach((h, i) => {
          const rooms = Number(h.rooms) || 0;
          const nights = Number(h.nights) || 0;
          const type = h.type ? h.type.toUpperCase() : "";
          const sar = Number(h.total) || 0;
          const rate = Number(s.hotel_sar_rate) || 0;
          rows.push({
            booking_date: s.booking_date,
            customer_code: cCode,
            customer_name: s.customer_name || "Walk-in Customer",
            ref_no: s.ref_no,
            item: `Hotel ${i + 1} - ${h.hotel || ""} (${type}${type ? ", " : ""}${rooms} Room${rooms > 1 ? "s" : ""}, ${nights} Night${nights > 1 ? "s" : ""})`,
            sale_sar: sar,
            sale_rate: rate,
            sale_pkr: sar * rate,
          });
        });
      }

      // Visa
      if (Array.isArray(s.visa)) {
        s.visa.forEach((v, i) => {
          const persons = Number(v.persons || 0);
          const rateVal = Number(v.rate || 0);
          const sar = Number(v.total ?? (persons * rateVal));
          const rate = Number(s.visa_sar_rate) || 0;
          rows.push({
            booking_date: s.booking_date,
            customer_code: cCode,
            customer_name: s.customer_name || "Walk-in Customer",
            ref_no: s.ref_no,
            item: v.type ? `Visa ${i + 1} - ${v.type} (${persons} Person${persons > 1 ? "s" : ""})` : `Visa ${i + 1} (${persons} Person${persons > 1 ? "s" : ""})`,
            sale_sar: sar,
            sale_rate: rate,
            sale_pkr: sar * rate,
          });
        });
      }

      // Transport
      if (Array.isArray(s.transport)) {
        s.transport.forEach((t, i) => {
          const label = t.text || t.route || t.description || "";
          const sar = Number(t.amount) || 0;
          const rate = Number(s.transport_sar_rate) || 0;
          rows.push({
            booking_date: s.booking_date,
            customer_code: cCode,
            customer_name: s.customer_name || "Walk-in Customer",
            ref_no: s.ref_no,
            item: label ? `Transport ${i + 1} - ${label}` : `Transport ${i + 1}`,
            sale_sar: sar,
            sale_rate: rate,
            sale_pkr: sar * rate,
          });
        });
      }

      // Ziyarat
      if (Array.isArray(s.ziyarat)) {
        s.ziyarat.forEach((t, i) => {
          const label = t.text || t.route || t.description || "";
          const sar = Number(t.amount) || 0;
          const rate = Number(s.ziyarat_sar_rate) || 0;
          rows.push({
            booking_date: s.booking_date,
            customer_code: cCode,
            customer_name: s.customer_name || "Walk-in Customer",
            ref_no: s.ref_no,
            item: label ? `Ziyarat ${i + 1} - ${label}` : `Ziyarat ${i + 1}`,
            sale_sar: sar,
            sale_rate: rate,
            sale_pkr: sar * rate,
          });
        });
      }
    });

    // 3. HOTELS ONLY (HOT-)
    const hotRes = await db.query(
      `SELECT * FROM hotels WHERE is_deleted = false ORDER BY booking_date DESC`
    );
    hotRes.rows.forEach((r) => {
      const cCode = r.customer_code || "WALKIN";
      (r.hotel_name || []).forEach((name, i) => {
        const type = r.hotel_type?.[i] ? r.hotel_type[i].toUpperCase() : "";
        const rooms = Number(r.hotel_rooms?.[i]) || 0;
        const nights = Number(r.hotel_nights?.[i]) || 0;
        const sar = Number(r.hotel_total?.[i]) || 0;
        const rate = Number(r.sar_rate) || 0;
        rows.push({
          booking_date: r.booking_date,
          customer_code: cCode,
          customer_name: r.customer_name || "Walk-in Customer",
          ref_no: r.ref_no,
          item: `Hotel ${i + 1} - ${name} (${type}${type ? ", " : ""}${rooms} Room${rooms > 1 ? "s" : ""}, ${nights} Night${nights > 1 ? "s" : ""})`,
          sale_sar: sar,
          sale_rate: rate,
          sale_pkr: sar * rate,
        });
      });
    });

    // 4. VISA ONLY (VISA-)
    const visaRes = await db.query(
      `SELECT * FROM visa WHERE is_deleted = false ORDER BY booking_date DESC`
    );
    visaRes.rows.forEach((v) => {
      const cCode = v.customer_code || "WALKIN";
      (v.rows || []).forEach((r, i) => {
        const sar = Number(r.total) || Number(r.persons * r.rate) || 0;
        const rate = Number(v.pkr_rate) || 0;
        rows.push({
          booking_date: v.booking_date,
          customer_code: cCode,
          customer_name: v.customer_name || "Walk-in Customer",
          ref_no: v.ref_no,
          item: r.type ? `Visa ${i + 1} - ${r.type} (${r.persons} Person${r.persons > 1 ? "s" : ""})` : `Visa (${r.persons} Person${r.persons > 1 ? "s" : ""})`,
          sale_sar: sar,
          sale_rate: rate,
          sale_pkr: sar * rate,
        });
      });
    });

    // 5. CARD ONLY (CARD-)
    const cardRes = await db.query(
      `SELECT * FROM card WHERE is_deleted = false ORDER BY booking_date DESC`
    );
    cardRes.rows.forEach((v) => {
      const cCode = v.customer_code || "WALKIN";
      (v.rows || []).forEach((r, i) => {
        const sar = Number(r.total) || Number(r.persons * r.rate) || 0;
        const rate = Number(v.pkr_rate) || 0;
        rows.push({
          booking_date: v.booking_date,
          customer_code: cCode,
          customer_name: v.customer_name || "Walk-in Customer",
          ref_no: v.ref_no,
          item: r.type ? `Card ${i + 1} - ${r.type} (${r.persons} Person${r.persons > 1 ? "s" : ""})` : `Card (${r.persons} Person${r.persons > 1 ? "s" : ""})`,
          sale_sar: sar,
          sale_rate: rate,
          sale_pkr: sar * rate,
        });
      });
    });

    // 6. GROUPS ONLY (GRP-)
    const grpRes = await db.query(
      `SELECT * FROM groups WHERE is_deleted = false ORDER BY booking_date DESC`
    );
    grpRes.rows.forEach((v) => {
      const cCode = v.customer_code || "WALKIN";
      (v.rows || []).forEach((r, i) => {
        const sar = Number(r.total) || Number(r.persons * r.rate) || 0;
        const rate = Number(v.pkr_rate) || 0;
        rows.push({
          booking_date: v.booking_date,
          customer_code: cCode,
          customer_name: v.customer_name || "Walk-in Customer",
          ref_no: v.ref_no,
          item: r.type ? `Groups ${i + 1} - ${r.type} (${r.persons} Person${r.persons > 1 ? "s" : ""})` : `Groups (${r.persons} Person${r.persons > 1 ? "s" : ""})`,
          sale_sar: sar,
          sale_rate: rate,
          sale_pkr: sar * rate,
        });
      });
    });

    // 7. TICKETING ONLY (TIC-)
    const ticRes = await db.query(
      `SELECT * FROM ticketing WHERE is_deleted = false ORDER BY booking_date DESC`
    );
    ticRes.rows.forEach((r) => {
      const cCode = r.customer_code || "WALKIN";
      const from = Array.isArray(r.flight_from) ? r.flight_from.join(", ") : r.flight_from || "";
      const to = Array.isArray(r.flight_to) ? r.flight_to.join(", ") : r.flight_to || "";
      const airline = Array.isArray(r.airline) ? r.airline.join(", ") : r.airline || "";
      const routeText = from && to ? `${from} → ${to}` : "";
      const extraInfo = [airline, routeText].filter(Boolean).join(" | ");

      const rate = Number(r.pkr_rate) || 0;

      if (r.adult_qty > 0) {
        const sar = r.adult_qty * r.adult_rate;
        rows.push({
          booking_date: r.booking_date,
          customer_code: cCode,
          customer_name: r.customer_name || "Walk-in Customer",
          ref_no: r.ref_no,
          item: `Ticket – Adult (${r.adult_qty} Person${r.adult_qty > 1 ? "s" : ""})${extraInfo ? " - " + extraInfo : ""}`,
          sale_sar: sar,
          sale_rate: rate,
          sale_pkr: sar * rate,
        });
      }
      if (r.child_qty > 0) {
        const sar = r.child_qty * r.child_rate;
        rows.push({
          booking_date: r.booking_date,
          customer_code: cCode,
          customer_name: r.customer_name || "Walk-in Customer",
          ref_no: r.ref_no,
          item: `Ticket – Child (${r.child_qty} Person${r.child_qty > 1 ? "s" : ""})${extraInfo ? " - " + extraInfo : ""}`,
          sale_sar: sar,
          sale_rate: rate,
          sale_pkr: sar * rate,
        });
      }
      if (r.infant_qty > 0) {
        const sar = r.infant_qty * r.infant_rate;
        rows.push({
          booking_date: r.booking_date,
          customer_code: cCode,
          customer_name: r.customer_name || "Walk-in Customer",
          ref_no: r.ref_no,
          item: `Ticket – Infant (${r.infant_qty} Person${r.infant_qty > 1 ? "s" : ""})${extraInfo ? " - " + extraInfo : ""}`,
          sale_sar: sar,
          sale_rate: rate,
          sale_pkr: sar * rate,
        });
      }
    });

    // 8. TRANSPORT ONLY (TRN-)
    const trnRes = await db.query(
      `SELECT * FROM transport WHERE is_deleted = false ORDER BY booking_date DESC`
    );
    trnRes.rows.forEach((r) => {
      const cCode = r.customer_code || "WALKIN";
      if (Array.isArray(r.rows)) {
        r.rows.forEach((t, i) => {
          const label = t.description || t.text || t.route || "";
          const sar = Number(t.sar) || 0;
          const rate = Number(r.pkr_rate) || 0;
          rows.push({
            booking_date: r.booking_date,
            customer_code: cCode,
            customer_name: r.customer_name || "Walk-in Customer",
            ref_no: r.ref_no,
            item: label ? `Transport ${i + 1} - ${label}` : `Transport ${i + 1}`,
            sale_sar: sar,
            sale_rate: rate,
            sale_pkr: sar * rate,
          });
        });
      }
    });

    // 9. ZIYARAT ONLY (ZIY-)
    const ziyRes = await db.query(
      `SELECT * FROM ziyarat WHERE is_deleted = false ORDER BY booking_date DESC`
    );
    ziyRes.rows.forEach((r) => {
      const cCode = r.customer_code || "WALKIN";
      if (Array.isArray(r.rows)) {
        r.rows.forEach((t, i) => {
          const label = t.description || t.text || t.route || "";
          const sar = Number(t.sar) || 0;
          const rate = Number(r.pkr_rate) || 0;
          rows.push({
            booking_date: r.booking_date,
            customer_code: cCode,
            customer_name: r.customer_name || "Walk-in Customer",
            ref_no: r.ref_no,
            item: label ? `Ziyarat ${i + 1} - ${label}` : `Ziyarat ${i + 1}`,
            sale_sar: sar,
            sale_rate: rate,
            sale_pkr: sar * rate,
          });
        });
      }
    });

    res.json({
      success: true,
      rows,
      customers: customerList,
    });
  } catch (err) {
    console.error("CUSTOMER SALE DETAIL REPORT ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================
   USER ACTIVITY / AUDIT REPORT
   - Date-to-date filtering
   - User / module / action filters
   - Auto-deletion of logs older than 15 days
===================================================== */
router.post("/activity/log", async (req, res) => {
  try {
    const b = req.body || {};
    const u = b.user || {};
    await db.query(
      `INSERT INTO public.activity_logs
       (user_id, username, action, module, description, reference_no, method, path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        u.id != null ? String(u.id) : null,
        String(u.username || u.name || u.display_name || "Unknown User").slice(0, 150),
        String(b.action || "OTHER").toUpperCase(),
        String(b.module || "System").slice(0, 100),
        b.description ? String(b.description).slice(0, 500) : null,
        b.reference_no ? String(b.reference_no).slice(0, 120) : null,
        b.method ? String(b.method).toUpperCase().slice(0, 20) : null,
        b.path ? String(b.path).slice(0, 500) : null,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("ACTIVITY LOG ERROR:", err);
    res.status(200).json({ success: false, error: err.message });
  }
});

router.get("/activity", async (req, res) => {
  try {
    // 🧹 15 din purana data auto delete
    await db.query(
      `DELETE FROM public.activity_logs WHERE created_at < NOW() - INTERVAL '15 days'`
    );

    // Date-to-date filtering support
    const fromDate = String(req.query.from_date || req.query.date || "").trim();
    const toDate = String(req.query.to_date || req.query.date || fromDate).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return res.status(400).json({ success: false, error: "Valid from_date and to_date are required (YYYY-MM-DD)." });
    }
    if (fromDate > toDate) {
      return res.status(400).json({ success: false, error: "to_date cannot be earlier than from_date." });
    }

    const params = [fromDate, toDate];
    const where = [
      `created_at >= $1::date`,
      `created_at < ($2::date + INTERVAL '1 day')`,
    ];

    if (req.query.user && req.query.user !== "ALL") {
      params.push(String(req.query.user));
      where.push(`username = $${params.length}`);
    }
    if (req.query.module && req.query.module !== "ALL") {
      params.push(String(req.query.module));
      where.push(`module = $${params.length}`);
    }
    if (req.query.action && req.query.action !== "ALL") {
      params.push(String(req.query.action).toUpperCase());
      where.push(`action = $${params.length}`);
    }

    const q = await db.query(
      `SELECT id,user_id,username,action,module,description,reference_no,method,path,created_at
       FROM public.activity_logs
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC`,
      params
    );

    const meta = await db.query(
      `SELECT
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT username ORDER BY username), NULL) AS users,
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT module ORDER BY module), NULL) AS modules
       FROM public.activity_logs
       WHERE created_at >= $1::date
         AND created_at < ($2::date + INTERVAL '1 day')`,
      [fromDate, toDate]
    );

    res.json({
      success: true,
      rows: q.rows,
      users: meta.rows[0]?.users || [],
      modules: meta.rows[0]?.modules || [],
    });
  } catch (err) {
    console.error("ACTIVITY REPORT ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================
   ⏰ UPCOMING PAYMENT DUE REPORT
   =========================================================
   REGISTERED CUSTOMER:
   - Package  : past + today + selected future days
   - Hotel    : past + today + selected future days
   - Ticketing: past + today + selected future days
   - Groups   : past + today + selected future days
   - Transport: past + today + selected future days 
   - Ziyarat / Visa / Card: 
                  NO DATE CRITERIA - ALL BOOKINGS
   - Payments / Adjustments / Opening Balance:
                  NO DATE CRITERIA - ALL HISTORY

   FINAL:
   Relevant Sales
   + Opening Balance
   - Payments
   - Adjustments
   = Balance Due

   WALK-IN:
   Existing per-reference behaviour preserved.
========================================================= */

/* =========================================================
   SAFE JSON DATE HELPERS
========================================================= */

const normalizeDateValue = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const str = String(value).trim();

  if (!str) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD/MM/YYYY
  let m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  // DD-MM-YYYY
  m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  const d = new Date(str);

  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString().slice(0, 10);
};


/* =========================================================
   EXTRACT DATES FROM PACKAGE FLIGHTS JSON
   ========================================================= */

const extractFlightDates = (value) => {
  const dates = [];

  const walk = (node) => {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (typeof node !== "object") return;

    Object.entries(node).forEach(([key, val]) => {
      const k = String(key).toLowerCase();

      /*
        Possible existing frontend keys:
        date
        flightDate
        flight_date
        travelDate
        travel_date
      */
      if (
        k === "date" ||
        k === "flightdate" ||
        k === "flight_date" ||
        k === "traveldate" ||
        k === "travel_date"
      ) {
        if (Array.isArray(val)) {
          val.forEach((x) => {
            const d = normalizeDateValue(x);
            if (d) dates.push(d);
          });
        } else {
          const d = normalizeDateValue(val);
          if (d) dates.push(d);
        }
      }

      /*
        Continue inside nested objects.
      */
      if (val && typeof val === "object") {
        walk(val);
      }
    });
  };

  walk(value);

  return [...new Set(dates)];
};


/* =========================================================
   EXTRACT HOTEL CHECK-IN JSON
   ========================================================= */

const extractHotelCheckinDates = (value) => {
  const dates = [];

  const walk = (node) => {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach((x) => {
        const d = normalizeDateValue(x);

        if (d) {
          dates.push(d);
        } else if (x && typeof x === "object") {
          walk(x);
        }
      });

      return;
    }

    if (typeof node === "object") {
      Object.values(node).forEach((val) => {
        if (Array.isArray(val) || (val && typeof val === "object")) {
          walk(val);
        } else {
          const d = normalizeDateValue(val);
          if (d) dates.push(d);
        }
      });

      return;
    }

    const d = normalizeDateValue(node);

    if (d) dates.push(d);
  };

  walk(value);

  return [...new Set(dates)];
};


/* =========================================================
   GET EARLIEST DATE
========================================================= */

const earliestDate = (dates) => {
  const valid = dates
    .map(normalizeDateValue)
    .filter(Boolean)
    .sort();

  return valid.length ? valid[0] : null;
};




// GET Upcoming / Due Payments Report
router.get('/upcoming-payment-due', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + days);
        endDate.setHours(23, 59, 59, 999);

        // 0. Fetch Archive Snapshot ID
        const snapshotRes = await db.query(`
            SELECT id FROM archive_snapshots ORDER BY id DESC LIMIT 1
        `);
        const snapshotId = snapshotRes.rows.length ? snapshotRes.rows[0].id : null;

        // 1. Fetch Registered Customers
        const custRes = await db.query(`
            SELECT 
                c.id, 
                c.customer_code AS customer_id, 
                c.name AS customer_name, 
                COALESCE(
                    NULLIF(to_jsonb(c.*)->>'phone_no', ''),
                    NULLIF(to_jsonb(c.*)->>'contact', ''),
                    NULLIF(to_jsonb(c.*)->>'mobile', ''),
                    NULLIF(to_jsonb(c.*)->>'phone', ''),
                    'N/A'
                ) AS phone_number,
                COALESCE((to_jsonb(c.*)->>'opening_balance')::numeric, 0) AS table_opening_balance,
                COALESCE(op_pay.total_op, 0) AS payment_opening_balance,
                COALESCE(snap.balance, 0) AS snapshot_opening_balance
            FROM customers c
            LEFT JOIN (
                SELECT 
                    COALESCE(
                        NULLIF(to_jsonb(customer_payments.*)->>'customer_code', ''),
                        NULLIF(to_jsonb(customer_payments.*)->>'customer_id', ''),
                        NULLIF(to_jsonb(customer_payments.*)->>'ref_no', '')
                    ) AS cust_ref,
                    SUM(COALESCE(amount, 0)::numeric) AS total_op 
                FROM customer_payments 
                WHERE type = 'opening_balance' AND is_deleted = false
                GROUP BY cust_ref
            ) op_pay ON (op_pay.cust_ref = c.customer_code OR op_pay.cust_ref = c.id::text)
            LEFT JOIN archive_balances snap ON (
                snap.snapshot_id = $1 AND 
                UPPER(snap.balance_type) = 'CUSTOMER' AND 
                snap.code = c.customer_code
            )
            WHERE c.is_deleted = false
        `, [snapshotId]);

        const registeredCustMap = {};
        custRes.rows.forEach(c => {
            const totalOB = parseFloat(c.table_opening_balance || 0) + 
                            parseFloat(c.payment_opening_balance || 0) + 
                            parseFloat(c.snapshot_opening_balance || 0);

            registeredCustMap[c.customer_id] = {
                ...c,
                opening_balance: totalOB
            };
        });

        // 2. Fetch ALL Payments & Adjustments
        const [paymentsRes, adjustmentsRes] = await Promise.all([
            db.query(`
                SELECT 
                    COALESCE(
                        NULLIF(to_jsonb(customer_payments.*)->>'customer_code', ''),
                        NULLIF(to_jsonb(customer_payments.*)->>'customer_id', ''),
                        NULLIF(to_jsonb(customer_payments.*)->>'ref_no', '')
                    ) AS cust_ref, 
                    ref_no,
                    SUM(COALESCE(amount, 0)::numeric) as total 
                FROM customer_payments 
                WHERE is_deleted = false 
                AND LOWER(COALESCE(type, '')) NOT IN ('adjustment', 'opening_balance')
                GROUP BY cust_ref, ref_no
            `),
            db.query(`
                SELECT 
                    COALESCE(
                        NULLIF(to_jsonb(customer_payments.*)->>'customer_code', ''),
                        NULLIF(to_jsonb(customer_payments.*)->>'customer_id', ''),
                        NULLIF(to_jsonb(customer_payments.*)->>'ref_no', '')
                    ) AS cust_ref, 
                    ref_no,
                    SUM(COALESCE(amount, 0)::numeric) as total 
                FROM customer_payments 
                WHERE is_deleted = false AND type = 'adjustment' 
                GROUP BY cust_ref, ref_no
            `)
        ]);

        const totalPaymentsByCust = {};
        const totalPaymentsByRef = {};
        paymentsRes.rows.forEach(r => {
            const amt = parseFloat(r.total) || 0;
            const key = r.cust_ref || r.ref_no;
            if (key) {
                if (key.startsWith('CUST-') || registeredCustMap[key]) {
                    totalPaymentsByCust[key] = (totalPaymentsByCust[key] || 0) + amt;
                } else {
                    totalPaymentsByRef[key] = (totalPaymentsByRef[key] || 0) + amt;
                }
            }
        });

        const totalAdjustmentsByCust = {};
        const totalAdjustmentsByRef = {};
        adjustmentsRes.rows.forEach(r => {
            const amt = parseFloat(r.total) || 0;
            const key = r.cust_ref || r.ref_no;
            if (key) {
                if (key.startsWith('CUST-') || registeredCustMap[key]) {
                    totalAdjustmentsByCust[key] = (totalAdjustmentsByCust[key] || 0) + amt;
                } else {
                    totalAdjustmentsByRef[key] = (totalAdjustmentsByRef[key] || 0) + amt;
                }
            }
        });

        // 3. Travel Date Extractor
        const extractTravelDate = (moduleType, row) => {
            if (['visa', 'card', 'ziyarat'].includes(moduleType)) return null;

            if (moduleType === 'packages') {
                let flightArr = row.flights;
                if (typeof flightArr === 'string') { try { flightArr = JSON.parse(flightArr); } catch(e){} }
                if (Array.isArray(flightArr) && flightArr.length > 0) {
                    const validFlight = flightArr.find(f => f.date || f.departure_date || f.travel_date);
                    if (validFlight) return validFlight.date || validFlight.departure_date || validFlight.travel_date;
                }
                let hotelArr = row.hotels;
                if (typeof hotelArr === 'string') { try { hotelArr = JSON.parse(hotelArr); } catch(e){} }
                if (Array.isArray(hotelArr) && hotelArr.length > 0) {
                    const validHotel = hotelArr.find(h => h.checkIn || h.check_in_date || h.checkInDate);
                    if (validHotel) return validHotel.checkIn || validHotel.check_in_date || validHotel.checkInDate;
                }
                return row.travel_date || null;
            }

            if (moduleType === 'ticketing') {
                let flightArr = row.flights;
                if (typeof flightArr === 'string') { try { flightArr = JSON.parse(flightArr); } catch(e){} }
                if (Array.isArray(flightArr) && flightArr.length > 0) {
                    return flightArr[0].date || flightArr[0].departure_date || flightArr[0].travel_date || null;
                }
                return row.travel_date || row.flight_date || row.departure_date || null;
            }

            if (moduleType === 'hotels') {
                if (Array.isArray(row.hotel_checkin_date) && row.hotel_checkin_date.length > 0) {
                    return row.hotel_checkin_date[0];
                }
                return row.check_in || row.checkin_date || row.check_in_date || row.booking_date || null;
            }

            if (moduleType === 'transport') {
                if (row.travel_date) return row.travel_date;
                let transportRows = row.rows || row.routes || row.details;
                if (transportRows) {
                    try {
                        const parsed = typeof transportRows === 'string' ? JSON.parse(transportRows) : transportRows;
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            const firstValid = parsed.find(r => r.travel_date || r.date);
                            if (firstValid) return firstValid.travel_date || firstValid.date;
                        }
                    } catch (err) {}
                }
                return null;
            }

            if (moduleType === 'groups') return row.travel_date || row.start_date || null;
            return null;
        };

        // 4. Fetch All Sales
        const moduleTables = [
            { name: 'packages', label: 'Package', table: 'bookings' },
            { name: 'hotels', label: 'Hotel', table: 'hotels' },
            { name: 'ticketing', label: 'Ticket', table: 'ticketing' },
            { name: 'transport', label: 'Transport', table: 'transport' },
            { name: 'groups', label: 'Group', table: 'groups' },
            { name: 'visa', label: 'Visa', table: 'visa' },
            { name: 'card', label: 'Card', table: 'card' },
            { name: 'ziyarat', label: 'Ziyarat', table: 'ziyarat' }
        ];

        let allSales = [];

        for (const mod of moduleTables) {
            const query = `SELECT * FROM ${mod.table} WHERE is_deleted = false`;
            const result = await db.query(query);

            result.rows.forEach(row => {
                const saleAmt = parseFloat(row.total_pkr || row.total_pkr_sale || row.amount || 0) || 0;
                const travelDate = extractTravelDate(mod.name, row);
                const custId = row.customer_code || row.customer_id || row.customer || null;

                allSales.push({
                    module: mod.name,
                    module_label: mod.label,
                    ref_no: row.ref_no,
                    customer_id: custId,
                    customer_name: row.customer_name || row.passenger_name,
                    sale_amount: saleAmt,
                    travel_date: travelDate,
                    created_at: row.created_at
                });
            });
        }

        const reportData = [];

        // 5. REGISTERED CUSTOMERS
        for (const custId in registeredCustMap) {
            const cust = registeredCustMap[custId];
            const custSales = allSales.filter(s => s.customer_id === custId || s.customer_id === cust.id);

            let validSalesSum = 0;
            const rowsToDisplay = [];

            custSales.forEach(s => {
                if (!s.travel_date) {
                    // Visa, Ziyarat, Card -> Always calculate and display if pending
                    validSalesSum += s.sale_amount;
                    rowsToDisplay.push(s);
                } else {
                    const tDate = new Date(s.travel_date);
                    tDate.setHours(0, 0, 0, 0);

                    if (tDate <= endDate) {
                        // Includes past + within criteria days (Excludes 8th day+)
                        validSalesSum += s.sale_amount;
                        rowsToDisplay.push(s);
                    }
                }
            });

            const openingBalance = parseFloat(cust.opening_balance) || 0;
            const grandTotalSale = validSalesSum + openingBalance;

            const payments = (totalPaymentsByCust[custId] || 0) + (totalPaymentsByCust[cust.id] || 0);
            const adjustments = (totalAdjustmentsByCust[custId] || 0) + (totalAdjustmentsByCust[cust.id] || 0);
            const totalPaid = payments + adjustments; 
            const balanceDue = grandTotalSale - totalPaid;

            // SHOW RULE: Balance > 0 AUR row hamari allowed window (Past or 0 to N days) mein hai
            if (balanceDue > 0 && rowsToDisplay.length > 0) {
                const sortedRows = rowsToDisplay.sort((a, b) => {
                    if (!a.travel_date) return 1;
                    if (!b.travel_date) return -1;
                    return new Date(a.travel_date) - new Date(b.travel_date);
                });

                const displayDate = sortedRows[0].travel_date;

                const moduleCounts = {};
                rowsToDisplay.forEach(s => {
                    moduleCounts[s.module_label] = (moduleCounts[s.module_label] || 0) + 1;
                });
                const serviceBreakup = Object.entries(moduleCounts)
                    .map(([label, cnt]) => cnt > 1 ? `${label} (${cnt})` : label)
                    .join(" | ") || "Account Balance";

                reportData.push({
                    type: 'Registered',
                    customer_type: 'REGISTERED',
                    customer_id: cust.customer_id,
                    customer_code: cust.customer_id,
                    customer_name: cust.customer_name,
                    phone_number: cust.phone_number || 'N/A',
                    ref_no: sortedRows.map(s => s.ref_no).filter(Boolean).join(', ') || 'N/A',
                    opening_balance: openingBalance,
                    bookings_sale: validSalesSum,
                    total_sale: grandTotalSale,
                    paid_amount: totalPaid,
                    total_paid: totalPaid,
                    balance_amount: Math.round(balanceDue),
                    balance_due: Math.round(balanceDue), 
                    travel_date: displayDate,
                    booking_count: rowsToDisplay.length,
                    bookings_count: rowsToDisplay.length,
                    service_breakup: serviceBreakup
                });
            }
        }

        // 6. WALK-IN CUSTOMERS
        const walkInSales = allSales.filter(s => (!s.customer_id || (!s.customer_id.startsWith('CUST-') && !registeredCustMap[s.customer_id])));
        const walkInGrouped = {};

        walkInSales.forEach(s => {
            const key = s.ref_no || `WALKIN-${s.customer_name}-${s.created_at}`;
            if (!walkInGrouped[key]) {
                walkInGrouped[key] = {
                    ref_no: s.ref_no,
                    customer_name: s.customer_name,
                    total_sale: 0,
                    travel_date: s.travel_date,
                    modules: []
                };
            }

            if (!s.travel_date) {
                walkInGrouped[key].total_sale += s.sale_amount;
                walkInGrouped[key].modules.push(s.module_label);
            } else {
                const tDate = new Date(s.travel_date);
                tDate.setHours(0, 0, 0, 0);

                if (tDate <= endDate) { // Past + Within criteria (Skip 8th day+)
                    walkInGrouped[key].total_sale += s.sale_amount;
                    walkInGrouped[key].modules.push(s.module_label);
                    if (!walkInGrouped[key].travel_date) {
                        walkInGrouped[key].travel_date = s.travel_date;
                    }
                }
            }
        });

        for (const refNo in walkInGrouped) {
            const item = walkInGrouped[refNo];
            const totalPaid = (totalPaymentsByRef[item.ref_no] || 0) + (totalAdjustmentsByRef[item.ref_no] || 0);
            const balanceDue = item.total_sale - totalPaid;

            // Past or Criteria record will show if payment is STILL PENDING
            if (balanceDue > 0 && item.total_sale > 0) {
                const uniqueModules = [...new Set(item.modules)].join(', ');
                reportData.push({
                    type: 'Walk-in',
                    customer_type: 'WALK-IN',
                    customer_id: 'Walk-in',
                    customer_code: 'Walk-in',
                    customer_name: item.customer_name || 'Walk-in Customer',
                    phone_number: 'N/A',
                    ref_no: item.ref_no || 'N/A',
                    opening_balance: 0,
                    bookings_sale: item.total_sale,
                    total_sale: item.total_sale,
                    paid_amount: totalPaid,
                    total_paid: totalPaid,
                    balance_amount: Math.round(balanceDue),
                    balance_due: Math.round(balanceDue),
                    travel_date: item.travel_date,
                    booking_count: 1,
                    bookings_count: 1,
                    service_breakup: uniqueModules || 'General Booking'
                });
            }
        }

        reportData.sort((a, b) => {
            if (!a.travel_date) return 1;
            if (!b.travel_date) return -1;
            return new Date(a.travel_date) - new Date(b.travel_date);
        });

        return res.json({ 
            success: true, 
            count: reportData.length, 
            rows: reportData, 
            data: reportData 
        });

    } catch (err) {
        console.error('Error in /upcoming-payment-due route:', err);
        return res.status(500).json({ 
            success: false, 
            message: err.message || 'Server error',
            error: err.message
        });
    }
});

/* =============================================================
   ✈️ UPCOMING TRAVEL / DEPARTURE REPORT (DETAILED)
   ============================================================= */
router.get('/upcoming-travel-report', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + days);
        endDate.setHours(23, 59, 59, 999);

        const todayISO = today.toISOString().split('T')[0];
        const endISO = endDate.toISOString().split('T')[0];

        // Safe Date Parsing Helper
        const parseValidDate = (dateStr) => {
            if (!dateStr || dateStr === 'N/A') return null;
            const parsed = new Date(dateStr);
            return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
        };

        const travelRecords = [];

        // -------------------------------------------------------------
        // 1. PACKAGES / BOOKINGS
        // -------------------------------------------------------------
        const packageRes = await db.query(`SELECT * FROM bookings WHERE is_deleted = false`);
        
        packageRes.rows.forEach(row => {
            const customerName = row.customer_name || row.passenger_name || 'N/A';
            const refNo = row.ref_no || 'N/A';
            const custId = row.customer_code || row.customer_id || 'N/A';
            const paxCount = (Number(row.adult_count) || 0) + (Number(row.child_count) || 0) + (Number(row.infant_count) || 0) || Number(row.pax_count) || 1;

            // A. Package Flights
            let flights = row.flights;
            if (typeof flights === 'string') { try { flights = JSON.parse(flights); } catch (e) {} }
            if (Array.isArray(flights)) {
                flights.forEach((f) => {
                    const travelDate = parseValidDate(f.date || f.departure_date || f.travel_date);
                    if (travelDate && travelDate >= todayISO && travelDate <= endISO) {
                        travelRecords.push({
                            module: 'packages',
                            service_type: 'Flight',
                            ref_no: refNo,
                            customer_id: custId,
                            customer_name: customerName,
                            travel_date: travelDate,
                            details: `Airline: ${f.airline || f.airline_name || 'N/A'} | Route: ${f.from || f.flight_from || ''} → ${f.to || f.flight_to || ''} | PNR: ${f.pnr || 'N/A'}`,
                            pax_count: paxCount
                        });
                    }
                });
            }

            // B. Package Hotels
            let hotels = row.hotels;
            if (typeof hotels === 'string') { try { hotels = JSON.parse(hotels); } catch (e) {} }
            if (Array.isArray(hotels)) {
                hotels.forEach((h) => {
                    const checkInDate = parseValidDate(h.checkIn || h.check_in_date || h.checkInDate || h.date);
                    if (checkInDate && checkInDate >= todayISO && checkInDate <= endISO) {
                        travelRecords.push({
                            module: 'packages',
                            service_type: 'Hotel',
                            ref_no: refNo,
                            customer_id: custId,
                            customer_name: customerName,
                            travel_date: checkInDate,
                            details: `Hotel: ${h.hotel || h.hotel_name || 'N/A'} | Type: ${h.type || 'N/A'} | Rooms: ${h.rooms || 1} | Nights: ${h.nights || 1}`,
                            pax_count: paxCount
                        });
                    }
                });
            }

            // C. Package Transport
            let transports = row.transport || row.transports;
            if (typeof transports === 'string') { try { transports = JSON.parse(transports); } catch (e) {} }
            if (Array.isArray(transports)) {
                transports.forEach((t) => {
                    const transportDate = parseValidDate(t.date || t.travel_date || t.pickup_date);
                    if (transportDate && transportDate >= todayISO && transportDate <= endISO) {
                        travelRecords.push({
                            module: 'packages',
                            service_type: 'Transport',
                            ref_no: refNo,
                            customer_id: custId,
                            customer_name: customerName,
                            travel_date: transportDate,
                            details: `Vehicle: ${t.vehicle_type || t.car_type || 'N/A'} | Route/Sector: ${t.text || t.route || t.description || 'N/A'}`,
                            pax_count: paxCount
                        });
                    }
                });
            }
        });

        // -------------------------------------------------------------
        // 2. HOTELS MODULE (Standalone)
        // -------------------------------------------------------------
        const hotelRes = await db.query(`SELECT * FROM hotels WHERE is_deleted = false`);
        hotelRes.rows.forEach(row => {
            const names = Array.isArray(row.hotel_name) ? row.hotel_name : [row.hotel_name];
            const checkIns = Array.isArray(row.hotel_checkin_date) ? row.hotel_checkin_date : [row.check_in || row.checkin_date || row.booking_date];

            names.forEach((hName, idx) => {
                const rawDate = checkIns[idx] || checkIns[0];
                const travelDate = parseValidDate(rawDate);
                if (travelDate && travelDate >= todayISO && travelDate <= endISO) {
                    travelRecords.push({
                        module: 'hotels',
                        service_type: 'Hotel Standalone',
                        ref_no: row.ref_no || 'N/A',
                        customer_id: row.customer_code || row.customer_id || 'WALK IN',
                        customer_name: row.customer_name || 'N/A',
                        travel_date: travelDate,
                        details: `Hotel: ${hName || 'N/A'} | Type: ${row.hotel_type?.[idx] || 'N/A'} | Rooms: ${row.hotel_rooms?.[idx] || 1} | Nights: ${row.hotel_nights?.[idx] || 1}`,
                        pax_count: row.total_pax || 1
                    });
                }
            });
        });

        // -------------------------------------------------------------
        // 3. TICKETING MODULE (Standalone)
        // -------------------------------------------------------------
        const ticketRes = await db.query(`SELECT * FROM ticketing WHERE is_deleted = false`);
        ticketRes.rows.forEach(row => {
            let flightArr = row.flights;
            if (typeof flightArr === 'string') { try { flightArr = JSON.parse(flightArr); } catch(e){} }

            const paxCount = (Number(row.adult_qty) || 0) + (Number(row.child_qty) || 0) + (Number(row.infant_qty) || 0) || 1;
            const airline = Array.isArray(row.airline) ? row.airline.join(", ") : (row.airline || 'N/A');
            const route = (row.flight_from && row.flight_to) ? `${row.flight_from} → ${row.flight_to}` : 'N/A';

            const rawDate = (Array.isArray(flightArr) && flightArr.length > 0) 
                ? (flightArr[0].date || flightArr[0].departure_date || flightArr[0].travel_date)
                : (row.travel_date || row.flight_date || row.booking_date);

            const travelDate = parseValidDate(rawDate);
            if (travelDate && travelDate >= todayISO && travelDate <= endISO) {
                travelRecords.push({
                    module: 'ticketing',
                    service_type: 'Air Ticket',
                    ref_no: row.ref_no || 'N/A',
                    customer_id: row.customer_code || row.customer_id || 'N/A',
                    customer_name: row.customer_name || 'N/A',
                    travel_date: travelDate,
                    details: `Airline: ${airline} | Route: ${route} | PNR/Ticket: ${row.pnr || row.ticket_no || 'N/A'}`,
                    pax_count: paxCount
                });
            }
        });

        // -------------------------------------------------------------
        // 4. TRANSPORT MODULE (Standalone)
        // -------------------------------------------------------------
        const transportRes = await db.query(`SELECT * FROM transport WHERE is_deleted = false`);
        transportRes.rows.forEach(row => {
            let rowsArr = row.rows || row.routes || row.details;
            if (typeof rowsArr === 'string') { try { rowsArr = JSON.parse(rowsArr); } catch(e){} }

            if (Array.isArray(rowsArr)) {
                rowsArr.forEach((t) => {
                    const travelDate = parseValidDate(t.travel_date || t.date || row.travel_date);
                    if (travelDate && travelDate >= todayISO && travelDate <= endISO) {
                        travelRecords.push({
                            module: 'transport',
                            service_type: 'Transport Standalone',
                            ref_no: row.ref_no || 'N/A',
                            customer_id: row.customer_code || row.customer_id || 'N/A',
                            customer_name: row.customer_name || 'N/A',
                            travel_date: travelDate,
                            details: `Route: ${t.description || t.text || t.route || 'N/A'} | Vehicle: ${row.vehicle_type || 'N/A'}`,
                            pax_count: row.pax_count || 1
                        });
                    }
                });
            }
        });

        // -------------------------------------------------------------
        // 5. GROUPS MODULE
        // -------------------------------------------------------------
        const groupRes = await db.query(`SELECT * FROM groups WHERE is_deleted = false`);
        groupRes.rows.forEach(row => {
            const travelDate = parseValidDate(row.travel_date || row.start_date || row.booking_date);
            if (travelDate && travelDate >= todayISO && travelDate <= endISO) {
                travelRecords.push({
                    module: 'groups',
                    service_type: 'Group Departure',
                    ref_no: row.ref_no || 'N/A',
                    customer_id: row.customer_code || row.customer_id || 'N/A',
                    customer_name: row.customer_name || row.group_name || 'N/A',
                    travel_date: travelDate,
                    details: `Group: ${row.group_name || 'N/A'} | Title: ${row.title || 'N/A'}`,
                    pax_count: row.total_pax || 1
                });
            }
        });

        // -------------------------------------------------------------
        // SORT BY TRAVEL DATE (Ascending) & CALCULATE DAYS LEFT
        // -------------------------------------------------------------
        travelRecords.sort((a, b) => new Date(a.travel_date) - new Date(b.travel_date));

        const finalReport = travelRecords.map(item => {
            const tDate = new Date(item.travel_date);
            tDate.setHours(0, 0, 0, 0);

            const diffTime = tDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let daysBadge = `${diffDays}d`;
            if (diffDays === 0) daysBadge = 'TODAY';

            return {
                ...item,
                days_left: daysBadge,
                days_count: diffDays
            };
        });

        return res.json({
            success: true,
            count: finalReport.length,
            data: finalReport
        });

    } catch (err) {
        console.error('Error in /upcoming-travel-report:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error fetching travel report',
            error: err.message
        });
    }
});

module.exports = router;