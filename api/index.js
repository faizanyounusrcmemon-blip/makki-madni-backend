const express = require("express");
const cors = require("cors");
const path = require("path");
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
// SALES
// ==========================
app.use("/api/bookings", require("../routes/bookings"));
app.use("/api/hotels", require("../routes/hotels"));
app.use("/api/ticketing", require("../routes/ticketing"));
app.use("/api/visa", require("../routes/visa"));
app.use("/api/transport", require("../routes/transport"));
app.use("/api/reports", require("../routes/reports"));
app.use("/api/deleted", require("../routes/deleted"));

// ==========================
// LEDGERS
// ==========================
app.use("/api/customer-ledger", require("../routes/customerLedger"));
app.use("/api/purchase-ledger", require("../routes/purchaseLedger"));
app.use("/api/bank-ledger", require("../routes/bankLedger"));
app.use("/api/ledger-delete", require("../routes/ledgerDelete"));
app.use("/api/balance-sheet", require("../routes/balanceSheet"));
app.use("/api/profit-report", require("../routes/profitReport"));
app.use("/api/expenseledger", require("../routes/expenseledger"));

// ==========================
// PURCHASE
// ==========================
app.use("/api/purchase", require("../routes/purchase"));

// ==========================
// AUTH
// ==========================
app.use("/api/auth", require("../routes/auth"));
app.use("/api/users", require("../routes/users"));

// ==========================
// BACKUP (MANUAL ONLY – VERCEL SAFE)
// ==========================
app.use("/api/backup", require("../routes/backup"));

// ==========================
// SYSTEM
// ==========================
app.use("/api/system", require("../routes/system"));

// ==========================
// ✅ PING ROUTE (VERCEL SAFE FIX)
// ==========================
app.use(
  "/ping",
  require(path.join(__dirname, "..", "routes", "ping"))
);

module.exports = app;
