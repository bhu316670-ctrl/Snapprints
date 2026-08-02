const jwt = require("jsonwebtoken");

const JWT_SECRET =
  process.env.JWT_SECRET || "snapprint-secret";

const JWT_EXPIRES_IN =
  process.env.JWT_EXPIRES_IN || "7d";

/**
 * Generate JWT
 */
exports.generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

/**
 * Verify JWT
 */
exports.verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};