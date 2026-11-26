require("dotenv").config();

const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { connectDatabase, closeDatabase } = require("./config/database");
const authRoutes = require("./routes/auth");
const noteRoutes = require("./routes/notes");
const { authenticateToken } = require("./middleware/auth");
const jwt = require("jsonwebtoken");
const appEvents = require("./utils/events");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json({ limit: "100kb" }));
app.get("/", (req, res) => res.json({ message: "Secure Connect API is running" }));
app.use("/api/auth", authRoutes);
app.use("/api/notes", noteRoutes);

app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({ message: "You accessed a protected route", user: req.user });
});

// Authenticate each Socket.IO connection using the same JWT issued by /api/auth/login.
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication token required"));
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.user.username} (${socket.id})`);

  socket.on("joinRoom", (roomName = "general") => {
    const room = String(roomName).trim().slice(0, 40) || "general";
    socket.join(room);
    socket.emit("joinedRoom", { room, message: `Joined ${room}` });
  });

  socket.on("chatMessage", (payload = {}) => {
    const room = String(payload.room || "general").trim().slice(0, 40);
    const message = String(payload.message || "").trim().slice(0, 1000);
    if (!message) return;

    const chatMessage = {
      username: socket.user.username,
      userId: socket.user.sub,
      room,
      message,
      sentAt: new Date().toISOString()
    };
    io.to(room).emit("chatMessage", chatMessage);
    appEvents.emit("chat:message", { room, username: socket.user.username });
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.user.username}`);
  });
});

// Central error handler: avoid leaking internal error details to clients.
app.use((err, req, res, next) => {
  console.error(err);
  if (err && err.code === 11000) return res.status(409).json({ message: "Email is already registered" });
  res.status(500).json({ message: "Internal server error" });
});

const PORT = Number(process.env.PORT) || 5000;

async function start() {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is missing in .env");
  await connectDatabase();
  server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}

start().catch((error) => {
  console.error("Unable to start server:", error.message);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await closeDatabase();
  process.exit(0);
});
