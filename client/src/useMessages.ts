import { useEffect, useState } from "react";
import { DbConnection, EventContext, Message } from "./moduleBindings";

export const useMessages = (conn: DbConnection | null): Message[] => {
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    if (!conn) return;
    const onNewMessage = (_: EventContext, message: Message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    };
    conn.db.message.onInsert(onNewMessage);

    const onDelete = (_ctx: EventContext, message: Message) => {
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
    };
    conn.db.message.onDelete(onDelete);

    return () => {
      conn.db.message.removeOnInsert(onNewMessage);
      conn.db.message.removeOnDelete(onDelete);
    };
  }, [conn]);
  return messages;
};
