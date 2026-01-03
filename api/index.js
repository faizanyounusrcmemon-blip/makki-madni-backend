const express = require("express");
const cors = require("cors");
require("dotenv").config();
require("../db"); // ✅ ROOT db.js (Vercel FIX)

const app = express();

app.use(cors());
app.use(express.json());

// ==========================
// FAVICON FIX
// ==========================
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/favicon.png", (req, res) => res.status(204).end());

// ==========================
// ROOT
// ==========================
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Makki Madni Backend Live" });
});

// ==========================
// ✅ PING (FINAL – CORRECT)
// ==========================
app.get("/ping", (req, res) => {
  res.json({
    success: true,
    message: "Server alive",
    time: new Date()
  });
});

// ==========================
// SALES
// ==========================
app.use("/bookings", require("../routes/bookings"));
app.use("/hotels", require("../routes/hotels"));
app.use("/ticketing", require("../routes/ticketing"));
app.use("/visa", require("../routes/visa"));
app.use("/transport", require("../routes/transport"));
app.use("/reports", require("../routes/reports"));
app.use("/deleted", require("../routes/deleted"));

// ==========================
// LEDGERS
// ==========================
app.use("/customer-ledger", require("../routes/customerLedger"));
app.use("/purchase-ledger", require("../routes/purchaseLedger"));
app.use("/bank-ledger", require("../routes/bankLedger"));
app.use("/ledger-delete", require("../routes/ledgerDelete"));
app.use("/balance-sheet", require("../routes/balanceSheet"));
app.use("/profit-report", require("../routes/profitReport"));
app.use("/expenseledger", require("../routes/expenseledger"));

// ==========================
// PURCHASE
// ==========================
app.use("/purchase", require("../routes/purchase"));

// ==========================
// AUTH
// ==========================
app.use("/auth", require("../routes/auth"));
app.use("/users", require("../routes/users"));

// ==========================
// BACKUP (MANUAL ONLY – VERCEL SAFE)
// ==========================
app.use("/backup", require("../routes/backup"));

// ==========================
// SYSTEM
// ==========================
app.use("/system", require("../routes/system"));

module.exports = app;
