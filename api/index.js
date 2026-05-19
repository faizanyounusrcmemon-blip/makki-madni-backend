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
// ✅ PING
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
app.use("/api/bookings", require("../routes/bookings"));

app.use("/hotels", require("../routes/hotels"));
app.use("/api/hotels", require("../routes/hotels"));

app.use("/ticketing", require("../routes/ticketing"));
app.use("/api/ticketing", require("../routes/ticketing"));

app.use("/visa", require("../routes/visa"));
app.use("/api/visa", require("../routes/visa"));

app.use("/card", require("../routes/card"));
app.use("/api/card", require("../routes/card"));

app.use("/transport", require("../routes/transport"));
app.use("/api/transport", require("../routes/transport"));

app.use("/ziyarat", require("../routes/ziyarat"));
app.use("/api/ziyarat", require("../routes/ziyarat"));

app.use("/reports", require("../routes/reports"));
app.use("/api/reports", require("../routes/reports"));

app.use("/deleted", require("../routes/deleted"));
app.use("/api/deleted", require("../routes/deleted"));

// ==========================
// LEDGERS
// ==========================
app.use("/customer-ledger", require("../routes/customerLedger"));
app.use("/api/customer-ledger", require("../routes/customerLedger"));

app.use("/purchase-ledger", require("../routes/purchaseLedger"));
app.use("/api/purchase-ledger", require("../routes/purchaseLedger"));

app.use("/bank-ledger", require("../routes/bankLedger"));
app.use("/api/bank-ledger", require("../routes/bankLedger"));

app.use("/cash-ledger", require("../routes/cashLedger"));
app.use("/api/cash-ledger", require("../routes/cashLedger"));

app.use("/ledger-delete", require("../routes/ledgerDelete"));
app.use("/api/ledger-delete", require("../routes/ledgerDelete"));

app.use("/balance-sheet", require("../routes/balanceSheet"));
app.use("/api/balance-sheet", require("../routes/balanceSheet"));

app.use("/profit-report", require("../routes/profitReport"));
app.use("/api/profit-report", require("../routes/profitReport"));

app.use("/expense-ledger", require("../routes/expenseLedger"));
app.use("/api/expense-ledger", require("../routes/expenseLedger"));

app.use("/supplier-ledger", require("../routes/supplierLedger"));
app.use("/api/supplier-ledger", require("../routes/supplierLedger"));

app.use("/monthly-profit-report", require("../routes/monthlyProfitReport"));
app.use("/api/monthly-profit-report", require("../routes/monthlyProfitReport"));



// ==========================
// PURCHASE
// ==========================
app.use("/purchase", require("../routes/purchase"));
app.use("/api/purchase", require("../routes/purchase"));

app.use("/supplier", require("../routes/supplier"));
app.use("/api/supplier", require("../routes/supplier"));


// ==========================
// AUTH
// ==========================
app.use("/auth", require("../routes/auth"));
app.use("/api/auth", require("../routes/auth"));

app.use("/users", require("../routes/users"));
app.use("/api/users", require("../routes/users"));

// ==========================
// BACKUP
// ==========================
app.use("/backup", require("../routes/backup"));
app.use("/api/backup", require("../routes/backup"));

// ==========================
// SYSTEM
// ==========================
app.use("/system", require("../routes/system"));
app.use("/api/system", require("../routes/system"));

module.exports = app;
