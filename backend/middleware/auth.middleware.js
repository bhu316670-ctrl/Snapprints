const db = require("../database/db");
const { verifyToken } = require("../utils/jwt");

/**
 * Authentication
 */

exports.authenticate = async (req, res, next) => {
  try {

    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const token = authHeader.split(" ")[1];

    const payload = verifyToken(token);

    /**
     * ADMIN
     */

    if (payload.type === "ADMIN") {

      const [rows] = await db.query(
        `
        SELECT
            id,
            name,
            email
        FROM admin_users
        WHERE id=?
        AND is_active=1
        LIMIT 1
        `,
        [payload.id]
      );

      if (!rows.length) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      req.user = {
        ...rows[0],
        type: "ADMIN",
      };

      return next();
    }

    /**
     * USER
     */

    if (payload.type === "USER") {

      const [rows] = await db.query(
        `
        SELECT
            id,
            full_name,
            email,
            phone
        FROM users
        WHERE id=?
        AND status='ACTIVE'
        LIMIT 1
        `,
        [payload.id]
      );

      if (!rows.length) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      req.user = {
        ...rows[0],
        type: "USER",
      };

      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });

  } catch (err) {

    console.error(err);

    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });

  }
};

/**
 * ADMIN ONLY
 */

exports.authorizeAdmin = (req, res, next) => {

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  if (req.user.type !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }

  next();
};