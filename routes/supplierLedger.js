const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================
   GET LEDGER FOR SUPPLIER
========================= */
router.get("/:supplierCode", async (req, res) => {
  try {
    const { supplierCode } = req.params;

    const supplier = await db.query(
      "SELECT id, supplier_name FROM suppliers WHERE supplier_code=$1",
      [supplierCode]
    );
    if (!supplier.rows.length)
      return res.json({ success: false, error: "Supplier not found" });

    const supplierId = supplier.rows[0].id;

    // PURCHASES (DEBIT)
    const purchases = await db.query(
      `SELECT pe.created_at::date AS date,
              'PURCHASE' AS type,
              '-' AS payment_method,
              SUM(pe.purchase_pkr) AS debit,
              0 AS credit,
              pe.ref_no,
              pe.supplier_name,
              SUM(pe.purchase_pkr) - COALESCE(sp.total_paid,0) AS pending_amount
       FROM purchase_entries pe
       LEFT JOIN (
         SELECT supplier_id, ref_no, SUM(amount) AS total_paid
         FROM supplier_payments
         WHERE supplier_id=$1
         GROUP BY supplier_id, ref_no
       ) sp ON sp.ref_no=pe.ref_no AND sp.supplier_id=$1
       WHERE pe.supplier_code=$2 AND pe.is_deleted=false
       GROUP BY pe.created_at::date, pe.ref_no, pe.supplier_name
       ORDER BY pe.created_at::date`,
      [supplierId, supplierCode]
    );

    // PAYMENTS / ADJUSTMENTS (CREDIT)
    const payments = await db.query(
      `SELECT payment_date AS date,
              type,
              payment_method,
              0 AS debit,
              amount AS credit
       FROM supplier_payments
       WHERE supplier_id=$1
       ORDER BY payment_date`,
      [supplierId]
    );

    // MERGE LEDGER + CALCULATE BALANCE
    const ledgerAll = [...purchases.rows, ...payments.rows].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    let balance = 0;
    const finalLedger = ledgerAll.map(r => {
      balance += Number(r.debit || 0) - Number(r.credit || 0);
      return { ...r, balance };
    });

    // PENDING LIST (always)
    const pending = purchases.rows.map(r => ({
      ref_no: r.ref_no,
      supplier_name: r.supplier_name,
      status: r.pending_amount > 0 ? "PENDING" : "PAID"
    })).filter(r => r.status === "PENDING");

    res.json({ success: true, ledger: finalLedger, pending });

  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* =========================
   SAVE PAYMENT / ADJUSTMENT
========================= */
router.post("/payment", async (req, res) => {
  try {
    const { supplier_code, payment_date, payment_method, amount, type } = req.body;

    const supplier = await db.query(
      "SELECT id FROM suppliers WHERE supplier_code=$1",
      [supplier_code]
    );
    if (!supplier.rows.length)
      return res.json({ success: false, error: "Supplier not found" });

    await db.query(
      `INSERT INTO supplier_payments
       (supplier_id, payment_date, payment_method, amount, type)
       VALUES ($1,$2,$3,$4,$5)`,
      [supplier.rows[0].id, payment_date, payment_method, amount, type]
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* =========================
   ALWAYS RETURN PENDING LIST
========================= */
router.get("/pending", async (req, res) => {
  try {
    const pending = await db.query(
      `SELECT pe.ref_no, pe.supplier_name,
              SUM(pe.purchase_pkr) - COALESCE(sp.total_paid,0) AS pending_amount
       FROM purchase_entries pe
       LEFT JOIN (
         SELECT supplier_id, ref_no, SUM(amount) AS total_paid
         FROM supplier_payments
         GROUP BY supplier_id, ref_no
       ) sp ON sp.ref_no=pe.ref_no
       WHERE pe.is_deleted=false
       GROUP BY pe.ref_no, pe.supplier_name
       HAVING SUM(pe.purchase_pkr) - COALESCE(sp.total_paid,0) > 0
       ORDER BY pe.ref_no DESC`
    );

    res.json({
      success: true,
      pending: pending.rows.map(r => ({
        ref_no: r.ref_no,
        supplier_name: r.supplier_name,
        status: "PENDING"
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
