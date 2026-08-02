const express = require("express");

const router = express.Router();

const authController = require("../controllers/auth.controller");

const {
  authenticate,
} = require("../middleware/auth.middleware");

/*
|--------------------------------------------------------------------------
| Public
|--------------------------------------------------------------------------
*/

router.post(
  "/admin/login",
  authController.adminLogin
);

router.post(
  "/user/login",
  authController.userLogin
);

/*
|--------------------------------------------------------------------------
| Protected
|--------------------------------------------------------------------------
*/

router.get(
  "/me",
  authenticate,
  authController.me
);

router.post(
  "/logout",
  authenticate,
  authController.logout
);

module.exports = router;