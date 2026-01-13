const express = require("express");
const router = express.Router();
const db = require("../db");

/* ================================
   GET ALL PENDING SUPPLIERS
================================ */
router.get("/pending", async (req,res)=>{
  try {
    const q = await db.query(`
      SELECT pe.supplier_code, s.supplier_name,
             SUM(pe.purchase_pkr) - COALESCE(SUM(sp.amount),0) AS pending_amount,
             CASE WHEN SUM(pe.purchase_pkr) - COALESCE(SUM(sp.amount),0) > 0 THEN 'PENDING' ELSE 'PAID' END AS status
      FROM purchase_entries pe
      JOIN suppliers s ON s.supplier_code = pe.supplier_code
      LEFT JOIN supplier_payments sp ON sp.supplier_id = s.id
      WHERE pe.is_deleted = false
      GROUP BY pe.supplier_code, s.supplier_name
      HAVING SUM(pe.purchase_pkr) - COALESCE(SUM(sp.amount),0) > 0
    `);
    res.json({success:true, pending: q.rows});
  } catch(e){ res.status(500).json({success:false, error:e.message}); }
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
      SELECT pe.created_at::date AS date,
             'PURCHASE' AS type,
             '-' AS payment_method,
             pe.purchase_pkr AS debit,
             0 AS credit
      FROM purchase_entries pe
      WHERE pe.supplier_code=$1 AND pe.is_deleted=false
      ORDER BY pe.created_at
    `,[supplierCode]);

    // PAYMENTS
    const payments = await db.query(`
      SELECT payment_date::date AS date,
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
      return {...r, balance};
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
