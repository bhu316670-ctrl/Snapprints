// middleware/verifyCustomerToken.js
const jwt = require("jsonwebtoken");

// Strict — blocks the request if token missing/invalid
function verifyCustomerToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing or expired session" });

    req.customer = jwt.verify(token, process.env.JWT_SECRET); // { customerId, mobile, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

// Lenient — attaches req.customer if a valid token is present, otherwise continues anonymously.
// Used on /api/upload-job so guest uploads (if you ever allow them) don't break.
function optionalCustomerToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) req.customer = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    // invalid/expired token → treat as anonymous, don't block the upload
  }
  next();
}

module.exports = { verifyCustomerToken, optionalCustomerToken };