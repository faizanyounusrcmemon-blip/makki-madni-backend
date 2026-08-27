const db = require("../db");

/* =========================================================
   MODULE MAPPING
   ========================================================= */
const moduleMapping = {
  bookings: "Packages",
  hotels: "Hotels",
  ticketing: "Ticketing",
  visa: "Visa",
  card: "Card",
  groups: "Groups",
  transport: "Transport",
  ziyarat: "Ziyarat",
  purchase: "Purchase",
  supplier: "Supplier",
  customers: "Customers",

  "customer-ledger": "Customer Ledger",
  "supplier-ledger": "Supplier Ledger",
  "registered-ledger": "Registered Ledger",
  "purchase-ledger": "Purchase Ledger",
  "bank-ledger": "Bank Ledger",
  "cash-ledger": "Cash Ledger",
  "expense-ledger": "Expense Ledger",

  users: "User Management",
  user: "User Management",
  auth: "Authentication",

  archive: "Archive System",
  restore: "Data Restore",
  password: "Security Settings",
};

const tableByRoute = {
  bookings: "bookings",
  hotels: "hotels",
  ticketing: "ticketing",
  visa: "visa",
  card: "card",
  groups: '"groups"',
  transport: "transport",
  ziyarat: "ziyarat",
  purchase: "purchase_entries",
};

function getRouteParts(req) {
  const clean = String(req.originalUrl || "")
    .replace(/^\/api\//, "")
    .split("?")[0]
    .split("/")
    .filter(Boolean);

  return {
    routeName: String(clean[0] || "").toLowerCase(),
    subPath: String(clean[1] || "").toLowerCase(),
  };
}

function getModuleName(routeName, subPath) {
  return (
    moduleMapping[routeName] ||
    moduleMapping[subPath] ||
    "System Control"
  );
}

/* =========================================================
   EXTRACT LOGGED-IN USER SAFELY
   ========================================================= */
async function getLoggedInUser(req) {
  try {
    // 1. Headers se Har Tarah ke Case Check Karein
    const headers = req.headers || {};
    const headerName =
      headers["x-user-name"] ||
      headers["x-username"] ||
      headers["username"] ||
      req.get("x-user-name") ||
      req.get("x-username") ||
      "";

    // 2. Request Body se Username Check Karein
    const body = req.body || {};
    const bodyUser =
      body.username ||
      body.user?.username ||
      body.user?.name ||
      (typeof body.user === "string" ? body.user : "");

    let searchUser = String(headerName || bodyUser || "").trim();

    // Agar User Mil Gaya
    if (searchUser && searchUser !== "Unknown User" && searchUser !== "undefined") {
      const result = await db.query(
        `SELECT id, username, name FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(name) = LOWER($1) LIMIT 1`,
        [searchUser]
      );

      if (result.rows.length) {
        return {
          id: result.rows[0].id,
          username: result.rows[0].username || result.rows[0].name,
        };
      }
      return { id: null, username: searchUser };
    }

    // 3. Last Fallback: Database Se Akheri Login User Utha Lo (Jo sab se last active tha)
    const lastLoginResult = await db.query(
      `SELECT username, user_id FROM activity_logs WHERE action = 'LOGIN' ORDER BY created_at DESC LIMIT 1`
    );

    if (lastLoginResult.rows.length) {
      return {
        id: lastLoginResult.rows[0].user_id || null,
        username: lastLoginResult.rows[0].username,
      };
    }

    return { id: null, username: "Unknown User" };
  } catch (err) {
    return { id: null, username: "Unknown User" };
  }
}

function getReference(req) {
  const b = req.body || {};
  return (
    b.ref_no ||
    b.customer_code ||
    b.supplier_code ||
    b.purchase_ref ||
    b.pkg_no ||
    req.params?.ref_no ||
    req.params?.ref ||
    req.params?.id ||
    "-"
  );
}

async function recordAlreadyExists(routeName, refNo, body) {
  if (!refNo || refNo === "-") return false;
  if (body?.is_edit === true || body?.isEdit === true) return true;
  const table = tableByRoute[routeName];
  if (!table) return false;

  try {
    const result = await db.query(
      `SELECT EXISTS (SELECT 1 FROM ${table} WHERE ref_no = $1) AS exists`,
      [refNo]
    );
    return !!result.rows[0]?.exists;
  } catch {
    return false;
  }
}

function getAction(req, routeName, refExistsBefore) {
  const method = String(req.method || "").toUpperCase();
  const path = String(req.originalUrl || "").toLowerCase();
  const body = req.body || {};

  if (path.includes("/auth/login")) return "LOGIN";
  if (path.includes("/auth/logout")) return "LOGOUT";

  if (body.activityAction) return String(body.activityAction).toUpperCase();
  if (method === "DELETE" || path.includes("/delete/") || path.endsWith("/delete")) return "DELETE";
  if (method === "PUT" || method === "PATCH") return "UPDATE";
  if (method === "POST" && (path.includes("/save") || path.includes("/update") || path.includes("/edit"))) {
    return refExistsBefore ? "UPDATE" : "CREATE";
  }
  if (method === "POST") return "CREATE";
  return "OTHER";
}

async function findPartyName(routeName, refNo, body) {
  if (body.customer_name || body.supplier_name || body.name) {
    return body.customer_name || body.supplier_name || body.name;
  }
  if (!refNo || refNo === "-") return "";

  try {
    const result = await db.query(
      `
      SELECT customer_name AS party FROM bookings WHERE ref_no = $1
      UNION ALL
      SELECT customer_name FROM visa WHERE ref_no = $1
      UNION ALL
      SELECT customer_name FROM hotels WHERE ref_no = $1
      UNION ALL
      SELECT customer_name FROM ticketing WHERE ref_no = $1
      UNION ALL
      SELECT customer_name FROM card WHERE ref_no = $1
      UNION ALL
      SELECT customer_name FROM "groups" WHERE ref_no = $1
      UNION ALL
      SELECT customer_name FROM transport WHERE ref_no = $1
      UNION ALL
      SELECT customer_name FROM ziyarat WHERE ref_no = $1
      LIMIT 1
      `,
      [refNo]
    );

    return result.rows[0]?.party || "";
  } catch {
    return "";
  }
}

/* =========================================================
   ACTIVITY LOGGER MIDDLEWARE EXPORT
   ========================================================= */
module.exports = async function activityLogger(req, res, next) {
  const method = String(req.method || "").toUpperCase();
  const originalUrl = String(req.originalUrl || "");

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return next();
  }

  if (originalUrl.includes("/reports/activity")) {
    return next();
  }

  const { routeName, subPath } = getRouteParts(req);
  const moduleName = getModuleName(routeName, subPath);
  const refNo = getReference(req);

  const originalSend = res.send;
  res.send = function (responseBody) {
    res.send = originalSend;

    if (res.statusCode >= 200 && res.statusCode < 300) {
      setImmediate(async () => {
        try {
          // Send response ke waqt user extract karo taake Multer/Body parser chal chuka ho
          const body = req.body || {};
          const loggedUser = await getLoggedInUser(req);
          const userId = loggedUser.id;
          const username = loggedUser.username;

          const refExistsBefore = await recordAlreadyExists(routeName, refNo, body);
          const actionName = getAction(req, routeName, refExistsBefore);
          const partyName = await findPartyName(routeName, refNo, body);

          let description = "";

          if (actionName === "LOGIN") {
            description = `User ${username} logged in successfully`;
          } else if (actionName === "LOGOUT") {
            description = `User ${username} logged out`;
          } else {
            description = `${actionName} action performed on ${moduleName}`;
            if (partyName && refNo !== "-") {
              description += ` for ${partyName} (${refNo})`;
            } else if (partyName) {
              description += ` for ${partyName}`;
            } else if (refNo !== "-") {
              description += ` (${refNo})`;
            }
          }

          await db.query(
            `
            INSERT INTO public.activity_logs
            (user_id, username, action, module, description, reference_no, method, path)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
              userId,
              username,
              actionName,
              moduleName,
              description,
              refNo,
              method,
              originalUrl,
            ]
          );
        } catch (err) {
          console.error("ACTIVITY LOG ERROR:", err.message);
        }
      });
    }

    return res.send(responseBody);
  };

  return next();
};