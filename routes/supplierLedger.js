const express = require("express");
const router = express.Router();
const db = require("../db");

/* ================================
   GET ALL PENDING / PARTIAL SUPPLIERS
   (NO -0, PARTIAL ONLY REAL AMOUNTS)
================================ */
router.get("/pending", async (req, res) => {
  try {
    const q = await db.query(`
      WITH purchase_totals AS (
        SELECT supplier_code, SUM(purchase_pkr) AS total_purchase
        FROM purchase_entries
        WHERE is_deleted = false
        GROUP BY supplier_code
      ),
      payment_totals AS (
        SELECT s.id AS supplier_id, s.supplier_code, COALESCE(SUM(sp.amount),0) AS total_paid
        FROM suppliers s
        LEFT JOIN supplier_payments sp ON sp.supplier_id = s.id
        WHERE s.is_deleted = false
        GROUP BY s.id, s.supplier_code
      )
      SELECT
        s.supplier_code,
        s.supplier_name,
        COALESCE(pt.total_purchase,0) AS total_purchase,
        COALESCE(ptot.total_paid,0) AS total_paid,
        COALESCE(pt.total_purchase,0) - COALESCE(ptot.total_paid,0) AS pending_amount,
        CASE
          WHEN COALESCE(pt.total_purchase,0) - COALESCE(ptot.total_paid,0) = 0 THEN 'PAID'
          WHEN COALESCE(ptot.total_paid,0) > 0 THEN 'PARTIAL'
          ELSE 'PENDING'
        END AS status
      FROM suppliers s
      LEFT JOIN purchase_totals pt ON pt.supplier_code = s.supplier_code
      LEFT JOIN payment_totals ptot ON ptot.supplier_code = s.supplier_code
      WHERE s.is_deleted = false
      /* ✅ Show only pending or partial (pending_amount > 0) */
      AND COALESCE(pt.total_purchase,0) - COALESCE(ptot.total_paid,0) > 0
      ORDER BY pending_amount DESC, s.supplier_name
    `);

    res.json({ success: true, pending: q.rows });
  } catch (e) {
    console.error("Pending suppliers error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ================================
   GET LEDGER BY SUPPLIER CODE
================================ */
router.get("/:supplierCode", async (req,res)=>{
  try {
    const {supplierCode} = req.params;
    const supplier = await db.query("SELECT id, supplier_name FROM suppliers WHERE supplier_code=$1",[supplierCode]);
    if(!supplier.rows.length) return res.json({success:false, error:"Supplier not found"});
    const supplierId = supplier.rows[0].id;

// PURCHASES
   const purchases = await db.query(`
     SELECT 
         pe.id,
         pe.created_at::date AS date,
         'Purchase' AS type,          -- type proper capitalization
         s.supplier_name,              -- supplier name include
         '-' AS payment_method,
         pe.purchase_pkr AS debit,
         0 AS credit,
         pe.item AS item
     FROM purchase_entries pe
     JOIN suppliers s ON s.supplier_code = pe.supplier_code
     WHERE pe.supplier_code=$1 AND pe.is_deleted=false
     ORDER BY pe.created_at
   `, [supplierCode]);

    // PAYMENTS
    const payments = await db.query(`
      SELECT id, payment_date::date AS date,
             type,
             payment_method,
             0 AS debit,
             amount AS credit
      FROM supplier_payments
      WHERE supplier_id=$1
      ORDER BY payment_date
    `,[supplierId]);

    // MERGE LEDGER
    const ledgerAll = [...purchases.rows, ...payments.rows].sort((a,b)=>new Date(a.date)-new Date(b.date));
    let balance=0;
    const finalLedger = ledgerAll.map(r=> {
      balance += Number(r.debit || 0) - Number(r.credit || 0);
      return {...r, balance, entry_type: r.type.toLowerCase().includes("payment") || r.type.toLowerCase().includes("adjustment") ? "payment" : "purchase"};
    });

    res.json({success:true, ledger: finalLedger});
  } catch(e){ res.status(500).json({success:false, error:e.message}); }
});

/* ================================
   SAVE PAYMENT / ADJUSTMENT
================================ */
router.post("/payment", async (req,res)=>{
  try {
    const {supplier_code, payment_date, payment_method, amount, type} = req.body;
    const supplier = await db.query("SELECT id FROM suppliers WHERE supplier_code=$1",[supplier_code]);
    if(!supplier.rows.length) return res.json({success:false,error:"Supplier not found"});
    await db.query(`
      INSERT INTO supplier_payments (supplier_id, payment_date, payment_method, amount, type)
      VALUES ($1,$2,$3,$4,$5)
    `,[supplier.rows[0].id, payment_date, payment_method, amount, type]);
    res.json({success:true});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

/* ================================
   DELETE LEDGER ENTRY
   PASSWORD: 786
================================ */
router.delete("/delete/:entryId", async (req, res) => {
  try {
    const { entryId } = req.params;
    const { password, type } = req.body; // type: 'purchase' or 'payment'

    if (!entryId || isNaN(Number(entryId))) {
      return res.json({ success: false, error: "Invalid entry ID" });
    }

    if (password !== "786") 
      return res.json({ success: false, error: "Invalid password" });

    if (type === "purchase") {
      // Prevent deletion of live purchase
      const { rows } = await db.query("SELECT status FROM purchase_entries WHERE id=$1", [entryId]);
      if (rows[0]?.status === "Live Purchase") 
        return res.json({ success: false, error: "Cannot delete Live Purchase" });
      await db.query("DELETE FROM purchase_entries WHERE id=$1", [entryId]);
    } 
    else if (type === "payment") {
      await db.query("DELETE FROM supplier_payments WHERE id=$1", [entryId]);
    } 
    else {
      return res.json({ success: false, error: "Invalid type" });
    }

    res.json({ success: true });
  } catch(e) { 
    res.status(500).json({ success: false, error: e.message }); 
  }
});

module.exports = router;
