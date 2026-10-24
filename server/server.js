import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { Server } from "socket.io";
import { verifyToken } from "./middleware/auth.js";

const app = express();

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

// Demo users - log in as either to test chat in two windows.
const USERS = [
  { userId: 1, name: "Ada", email: "ada@threadbase.dev", password: "password" },
  { userId: 2, name: "Linus", email: "linus@threadbase.dev", password: "password" },
];

// POST /auth/login -> { accessToken, user }
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body ?? {};
  const found = USERS.find(
    (user) => user.email === email && user.password === password
  );

  if (!found) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const accessToken = jwt.sign(
    { userId: found.userId, name: found.name },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({
    accessToken,
    user: { userId: found.userId, name: found.name },
  });
});

// Existing protected HTTP route remains unchanged.
app.get("/api/me", verifyToken, (req, res) => {
  res.json({ user: req.user });
});

// Attach Socket.io to the same HTTP server as Express.
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

// Authenticate each socket using the JWT supplied in its handshake.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token || typeof token !== "string") {
    return next(new Error("Authentication required"));
  }

  if (!process.env.JWT_SECRET) {
    return next(new Error("Server authentication is not configured"));
  }

  try {
    socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.data.user.name}`);

  socket.on("room:join", (roomId) => {
    if (typeof roomId !== "string" || !roomId.trim()) return;
    socket.join(roomId);
  });

  socket.on("chat:message", ({ roomId, text } = {}) => {
    if (typeof roomId !== "string" || !roomId.trim()) return;
    if (typeof text !== "string" || !text.trim()) return;

    const message = {
      id: randomUUID(),
      text: text.trim(),
      user: {
        userId: socket.data.user.userId,
        name: socket.data.user.name,
      },
      timestamp: new Date().toISOString(),
    };

    // Broadcast to everyone currently in the selected room, including sender.
    io.to(roomId).emit("chat:message", message);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.data.user.name}`);
  });
});

const PORT = process.env.PORT ?? 3001;

httpServer.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT}`);
  console.log("  POST /auth/login");
  console.log("  Socket.io: enabled");
});
