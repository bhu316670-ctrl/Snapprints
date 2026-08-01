const express = require("express");

const router = express.Router();

const authController = require("../controllers/auth.controller");

const {
  authenticate,
} = require("../middleware/auth.middleware");

/* =====================================
   ADMIN LOGIN
===================================== */

router.post(
  "/admin/login",
  authController.adminLogin
);

/* =====================================
   USER LOGIN
===================================== */

router.post(
  "/user/login",
  authController.userLogin
);

/* =====================================
   CURRENT USER
===================================== */

router.get(
  "/me",
  authenticate,
  authController.me
);

/* =====================================
   LOGOUT
===================================== */

router.post(
  "/logout",
  authenticate,
  authController.logout
);

module.exports = router;