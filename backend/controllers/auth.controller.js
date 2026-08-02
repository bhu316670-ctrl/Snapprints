const bcrypt = require("bcrypt");
const db = require("../database/db");

const { generateToken } = require("../utils/jwt");

/**
 * Shared Login
 */
async function login({
  table,
  email,
  password,
  type,
}) {
  const [rows] = await db.query(
    `SELECT * FROM ${table} WHERE email=? LIMIT 1`,
    [email]
  );

  if (!rows.length) {
    throw new Error("Invalid email or password");
  }

  const user = rows[0];

  /**
   * Account Status
   */

  if (type === "ADMIN") {
    if (!user.is_active) {
      throw new Error("Account disabled");
    }
  }

  if (type === "USER") {
    if (user.status !== "ACTIVE") {
      throw new Error("Account disabled");
    }
  }

  /**
   * Password
   */

  const valid = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!valid) {
    throw new Error("Invalid email or password");
  }

  /**
   * JWT
   */

  const token = generateToken({
    id: user.id,
    type,
  });

  /**
   * Response User
   */

  const responseUser =
    type === "ADMIN"
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          type: "ADMIN",
        }
      : {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          type: "USER",
        };

  return {
    token,
    user: responseUser,
  };
}

/**
 * Admin Login
 */

exports.adminLogin = async (req, res) => {
  try {
    const result = await login({
      table: "admin_users",
      email: req.body.email,
      password: req.body.password,
      type: "ADMIN",
    });

    res.json({
      success: true,
      message: "Login successful",
      ...result,
    });

  } catch (err) {

    res.status(401).json({
      success: false,
      message: err.message,
    });

  }
};

/**
 * User Login
 */

exports.userLogin = async (req, res) => {
  try {

    const result = await login({
      table: "users",
      email: req.body.email,
      password: req.body.password,
      type: "USER",
    });

    res.json({
      success: true,
      message: "Login successful",
      ...result,
    });

  } catch (err) {

    res.status(401).json({
      success: false,
      message: err.message,
    });

  }
};

/**
 * Current User
 */

exports.me = async (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
};

/**
 * Logout
 */

exports.logout = async (req, res) => {
  res.json({
    success: true,
    message: "Logged out",
  });
};