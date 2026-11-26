const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const { getDb } = require("../config/database");
const appEvents = require("../utils/events");
const { authenticateToken, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.post("/signup", async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "username, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const users = getDb().collection("users");
    const normalizedEmail = String(email).trim().toLowerCase();
    if (await users.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS) || 12);
    const isFirstAdmin = normalizedEmail === String(process.env.ADMIN_EMAIL || "").toLowerCase();
    const user = {
      username: String(username).trim(),
      email: normalizedEmail,
      passwordHash,
      role: isFirstAdmin ? "admin" : "user",
      createdAt: new Date()
    };

    const result = await users.insertOne(user);
    appEvents.emit("user:registered", { email: normalizedEmail });

    return res.status(201).json({
      message: "User registered successfully",
      user: { id: result.insertedId, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) { next(error); }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "email and password are required" });

    const user = await getDb().collection("users").findOne({
      email: String(email).trim().toLowerCase()
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { sub: user._id.toString(), username: user.username, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    return res.json({
      message: "Login successful",
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) { next(error); }
});

router.get("/me", authenticateToken, (req, res) => {
  res.json({ message: "Authenticated user", user: req.user });
});

router.get("/admin/users", authenticateToken, allowRoles("admin"), async (req, res, next) => {
  try {
    const users = await getDb().collection("users")
      .find({}, { projection: { passwordHash: 0 } }).toArray();
    res.json({ count: users.length, users });
  } catch (error) { next(error); }
});

module.exports = router;
