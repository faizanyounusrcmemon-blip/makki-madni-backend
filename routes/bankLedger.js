const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req,res)=>{
  const inq = await db.query(`
    SELECT payment_date AS date, amount FROM customer_payments
    WHERE type='payment'
  `);

  const outq = await db.query(`
    SELECT payment_date AS date, amount FROM purchase_payments
    WHERE type='payment'
  `);

  let rows = [];
  let balance = 0;

  inq.rows.forEach(r=>{
    balance += Number(r.amount);
    rows.push({ date:r.date, desc:"Customer Payment", in:r.amount, out:0, balance });
  });

  outq.rows.forEach(r=>{
    balance -= Number(r.amount);
    rows.push({ date:r.date, desc:"Supplier Payment", in:0, out:r.amount, balance });
  });

  res.json({ success:true, rows });
});

module.exports = router;
