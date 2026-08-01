const db = require("../database/db");
const { verifyToken } = require("../utils/jwt");

/**
 * Authenticate User/Admin
 */
exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing",
      });
    }

    const token = authHeader.split(" ")[1];

    const payload = verifyToken(token);

    let user = null;

    // -----------------------------
    // Admin
    // -----------------------------
    if (payload.type === "ADMIN") {
      const [rows] = await db.query(
        `
        SELECT
          id,
          name,
          email,
          role,
          is_active
        FROM admin_users
        WHERE id = ?
        LIMIT 1
        `,
        [payload.id]
      );

      if (!rows.length || !rows[0].is_active) {
        return res.status(401).json({
          success: false,
          message: "Admin account not found",
        });
      }

      user = {
        ...rows[0],
        type: "ADMIN",
      };
    }

    // -----------------------------
    // User
    // -----------------------------
    else if (payload.type === "USER") {
      const [rows] = await db.query(
        `
        SELECT
          id,
          full_name,
          email,
          is_active
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [payload.id]
      );

      if (!rows.length || !rows[0].is_active) {
        return res.status(401).json({
          success: false,
          message: "User account not found",
        });
      }

      user = {
        ...rows[0],
        type: "USER",
      };
    }

    else {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    req.user = user;

    next();

  } catch (err) {
    console.error("AUTH ERROR:", err);

    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
};

/**
 * Restrict Admin Roles
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {

    if (!req.user || req.user.type !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    next();
  };
};