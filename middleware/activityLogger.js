const db = require("../db");

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
  "customer-ledger": "Payments",
  "supplier-ledger": "Payments",
  "registered-ledger": "Payments",
  users: "User Management",
  user: "User Management",
  archive: "Archive System",
  restore: "Data Restore",
  password: "Security Settings",
  auth: "System Auth"
};

module.exports = async function activityLogger(req, res, next) {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const originalSend = res.send;

    res.send = function (body) {
      res.send = originalSend;

      if (res.statusCode >= 200 && res.statusCode < 300) {
        setTimeout(async () => {
          try {
            const pathParts = req.originalUrl.replace(/^\/api\//, "").split("?")[0].split("/");
            const routeName = pathParts[0] ? pathParts[0].toLowerCase() : "";
            const subPath = pathParts[1] ? pathParts[1].toLowerCase() : "";

            const moduleName = moduleMapping[routeName] || moduleMapping[subPath] || "System Control";
            const fullUrl = req.originalUrl.toLowerCase();
            const b = req.body || {};

            // 1. EXTRACT REFERENCE / CODE
            let refNo = 
              b.ref_no || 
              b.customer_code || 
              b.supplier_code || 
              b.purchase_ref || 
              b.pkg_no ||
              req.params?.ref_no ||
              req.params?.customer_code ||
              req.params?.supplierCode ||
              "-";

            // 2. ACTION DETECTION
            let actionName = "CREATE";
            if (req.method === "PUT" || req.method === "PATCH" || fullUrl.includes("/edit/")) {
              actionName = "UPDATE";
            } else if (req.method === "DELETE" || fullUrl.includes("/delete/")) {
              actionName = "DELETE";
            }

            // 3. LOGGED IN USER (FIXED: Hardcoded "faizan" Removed)
            let loggedUsername = 
              req.headers["x-user-name"] || 
              req.headers["username"] || 
              req.headers["x-username"] || 
              b.logged_username || 
              b.username || 
              req.user?.username || 
              req.user?.name || 
              "System User";

            // 4. FETCH PARTY NAME (CUSTOMER / SUPPLIER / REGISTERED)
            let partyName = b.customer_name || b.supplier_name || b.name || "";

            if (!partyName && refNo && refNo !== "-") {
              try {
                if (refNo.toUpperCase().startsWith("CUST-")) {
                  const cRes = await db.query(
                    `SELECT name FROM customers WHERE customer_code = $1 LIMIT 1`,
                    [refNo]
                  );
                  if (cRes.rows.length > 0) partyName = cRes.rows[0].name;
                }
                
                if (!partyName && (refNo.toUpperCase().startsWith("SUP-") || routeName.includes("supplier"))) {
                  const sRes = await db.query(
                    `SELECT supplier_name FROM suppliers WHERE supplier_code = $1 LIMIT 1`,
                    [refNo]
                  );
                  if (sRes.rows.length > 0) partyName = sRes.rows[0].supplier_name;
                }

                if (!partyName) {
                  const q = `
                    SELECT customer_name AS party FROM bookings WHERE ref_no = $1
                    UNION ALL SELECT customer_name AS party FROM visa WHERE ref_no = $1
                    UNION ALL SELECT customer_name AS party FROM hotels WHERE ref_no = $1
                    UNION ALL SELECT customer_name AS party FROM ticketing WHERE ref_no = $1
                    UNION ALL SELECT supplier_name AS party FROM purchase WHERE ref_no = $1
                    LIMIT 1
                  `;
                  const r = await db.query(q, [refNo]);
                  if (r.rows.length > 0) partyName = r.rows[0].party;
                }

                if (!partyName) {
                  const arch = await db.query(
                    `SELECT name FROM archive_balances WHERE code = $1 LIMIT 1`,
                    [refNo]
                  );
                  if (arch.rows.length > 0) partyName = arch.rows[0].name;
                }
              } catch (e) {
                console.error("LOG NAME FETCH ERROR:", e.message);
              }
            }

            // 5. EDIT/DELETE ID CASE LOOKUP
            if ((!refNo || refNo === "-") && req.params?.id) {
              try {
                const payId = req.params.id;
                const pRes = await db.query(
                  `SELECT ref_no FROM customer_payments WHERE id = $1 LIMIT 1`,
                  [payId]
                );
                if (pRes.rows.length > 0) {
                  refNo = pRes.rows[0].ref_no;
                  const cRes = await db.query(
                    `SELECT name FROM customers WHERE customer_code = $1 LIMIT 1`,
                    [refNo]
                  );
                  if (cRes.rows.length > 0) partyName = cRes.rows[0].name;
                }
              } catch (e) {}
            }

            // 6. BUILD FINAL DESCRIPTION
            let description = `${actionName} action performed on ${moduleName}`;
            if (partyName && refNo && refNo !== "-") {
              description += ` for ${partyName} (${refNo})`;
            } else if (partyName) {
              description += ` for ${partyName}`;
            } else if (refNo && refNo !== "-") {
              description += ` (${refNo})`;
            }

            // 7. INSERT INTO DATABASE
            await db.query(
              `INSERT INTO public.activity_logs (user_id, username, action, module, description, reference_no, method, path) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                b.user_id || req.user?.id || null,
                loggedUsername,
                actionName,
                moduleName,
                description,
                refNo,
                req.method,
                req.originalUrl
              ]
            );
          } catch (err) {
            console.error("LOGGING ERROR:", err.message);
          }
        }, 0);
      }

      return res.send(body);
    };
  }
  next();
};