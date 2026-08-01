const bcrypt = require("bcrypt");
const db = require("../database/db");

const { generateToken } = require("../utils/jwt");

/**
 * Shared Login Function
 */
async function login({
  table,
  emailColumn = "email",
  passwordColumn = "password_hash",
  email,
  password,
  type,
}) {
  const [rows] = await db.query(
    `
    SELECT *
    FROM ${table}
    WHERE ${emailColumn} = ?
    LIMIT 1
    `,
    [email]
  );

  if (!rows.length) {
    throw new Error("Invalid email or password");
  }

  const user = rows[0];

  if (!user.is_active) {
    throw new Error("Account has been disabled");
  }

  const validPassword = await bcrypt.compare(
    password,
    user[passwordColumn]
  );

  if (!validPassword) {
    throw new Error("Invalid email or password");
  }

  const payload = {
    id: user.id,
    type,
  };

  if (type === "ADMIN") {
    payload.role = user.role;
  }

  const token = generateToken(payload);

  delete user[passwordColumn];

  return {
    token,
    user,
  };
}

/* =====================================
   ADMIN LOGIN
===================================== */

exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await login({
      table: "admin_users",
      email,
      password,
      type: "ADMIN",
    });

    return res.json({
      success: true,
      message: "Admin login successful",
      ...result,
    });

  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err.message,
    });
  }
};

/* =====================================
   USER LOGIN
===================================== */

exports.userLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await login({
      table: "users",
      email,
      password,
      type: "USER",
    });

    return res.json({
      success: true,
      message: "User login successful",
      ...result,
    });

  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err.message,
    });
  }
};

/* =====================================
   CURRENT USER
===================================== */

exports.me = async (req, res) => {
  return res.json({
    success: true,
    user: req.user,
  });
};

/* =====================================
   LOGOUT
===================================== */

exports.logout = async (req, res) => {
  return res.json({
    success: true,
    message: "Logged out successfully",
  });
};