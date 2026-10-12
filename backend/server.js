const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins
  }
});
const PORT = process.env.PORT || 3000;
const activeScreens = new Map();

app.get("/health", (_req, res) => res.json({ ok: true }));

io.on("connection", (socket) => {
  socket.data.mediaState = { microphone: false, camera: false };

  socket.on("join-room", ({ room, username } = {}) => {
    room = String(room || "").trim().slice(0, 40);
    username = String(username || "Visitante").trim().slice(0, 24);
    if (!room) return socket.emit("app-error", "Digite o nome da sala.");
    if (socket.data.room) {
      socket.leave(socket.data.room);
      socket.to(socket.data.room).emit("user-left", { id: socket.id });
      if (activeScreens.get(socket.data.room)?.id === socket.id) {
        activeScreens.delete(socket.data.room);
        socket.to(socket.data.room).emit("screen-stopped", { id: socket.id });
      }
    }

    socket.data.room = room;
    socket.data.username = username || "Visitante";
    socket.join(room);

    const peers = [...(io.sockets.adapter.rooms.get(room) || [])]
      .filter((id) => id !== socket.id)
      .map((id) => ({
        id,
        username: io.sockets.sockets.get(id)?.data.username || "Visitante",
        mediaState: io.sockets.sockets.get(id)?.data.mediaState || { microphone: false, camera: false }
      }));

    socket.emit("room-joined", {
      room,
      peers,
      screenOwner: activeScreens.get(room) || null
    });
    socket.to(room).emit("user-joined", {
      id: socket.id,
      username: socket.data.username,
      mediaState: socket.data.mediaState
    });
    socket.to(room).emit("system-message", `${socket.data.username} entrou na sala.`);
  });

  socket.on("media-state", ({ microphone, camera } = {}) => {
    const room = socket.data.room;
    if (!room || typeof microphone !== "boolean" || typeof camera !== "boolean") return;
    socket.data.mediaState = { microphone, camera };
    io.to(room).emit("media-state", {
      id: socket.id,
      microphone,
      camera
    });
  });

  socket.on("chat-message", (text) => {
    const room = socket.data.room;
    if (!room || typeof text !== "string") return;
    text = text.trim().slice(0, 1500);
    if (!text) return;
    io.to(room).emit("chat-message", {
      id: socket.id,
      username: socket.data.username || "Visitante",
      text,
      at: new Date().toISOString()
    });
  });

  socket.on("signal", ({ to, data } = {}) => {
    if (!socket.data.room || !to || !data) return;
    const target = io.sockets.sockets.get(to);
    if (target && target.data.room === socket.data.room) {
      io.to(to).emit("signal", { from: socket.id, data });
    }
  });

  socket.on("screen-started", (ack) => {
    const room = socket.data.room;
    if (!room) return;
    const currentOwner = activeScreens.get(room);
    if (currentOwner && currentOwner.id !== socket.id) {
      if (typeof ack === "function") {
        ack({ ok: false, message: "Alguém já está compartilhando a tela nesta sala." });
      }
      return;
    }
    const owner = { id: socket.id, username: socket.data.username || "Visitante" };
    activeScreens.set(room, owner);
    socket.to(room).emit("screen-started", owner);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("screen-stopped", () => {
    const room = socket.data.room;
    if (room && activeScreens.get(room)?.id === socket.id) {
      activeScreens.delete(room);
      socket.to(room).emit("screen-stopped", { id: socket.id });
    }
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (room) {
      if (activeScreens.get(room)?.id === socket.id) {
        activeScreens.delete(room);
        socket.to(room).emit("screen-stopped", { id: socket.id });
      }
      socket.to(room).emit("user-left", { id: socket.id });
      socket.to(room).emit("system-message", `${socket.data.username || "Alguém"} saiu da sala.`);
    }
  });
});

server.listen(PORT, () => console.log(`GameChat API rodando na porta ${PORT}`));