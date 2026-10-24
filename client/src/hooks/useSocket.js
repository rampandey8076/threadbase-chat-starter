import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../auth/AuthContext.jsx";

export function useSocket(roomId) {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token || !roomId) {
      socketRef.current = null;
      return undefined;
    }

    const socket = io(
      import.meta.env.VITE_SOCKET_URL || "http://localhost:3001",
      {
        auth: { token },
      }
    );

    socketRef.current = socket;

    const onConnect = () => {
      socket.emit("room:join", roomId);
    };

    const onMessage = (message) => {
      setMessages((previous) => [...previous, message]);
    };

    socket.on("connect", onConnect);
    socket.on("chat:message", onMessage);

    // Socket.io can reconnect automatically; join the room on each connection.
    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("chat:message", onMessage);
      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [token, roomId]);

  const sendMessage = useCallback(
    (text) => {
      const cleanText = typeof text === "string" ? text.trim() : "";
      if (!cleanText || !socketRef.current) return;

      socketRef.current.emit("chat:message", {
        roomId,
        text: cleanText,
      });
    },
    [roomId]
  );

  return { messages, sendMessage };
}
