import { Identity } from "@clockworklabs/spacetimedb-sdk";
import { useEffect, useRef, useState } from "react";
import {
  DbConnection,
  ErrorContext,
  EventContext,
  Message,
  User,
} from "./moduleBindings";

const useConnection = () => {
  const [connected, setConnected] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [conn, setConn] = useState<DbConnection | null>(null);

  useEffect(() => {
    const subscribeToQueries = (conn: DbConnection, queries: string[]) => {
      let count = 0;
      for (const query of queries) {
        conn
          ?.subscriptionBuilder()
          .onApplied(() => {
            count++;
            if (count === queries.length) {
              console.log("SDK client cache initialized.");
            }
          })
          .subscribe(query);
      }
    };

    const onConnect = (
      conn: DbConnection,
      identity: Identity,
      token: string
    ) => {
      setIdentity(identity);
      setConnected(true);
      localStorage.setItem("auth_token", token);
      console.log(
        "Connected to SpacetimeDB with identity:",
        identity.toHexString()
      );
      conn.reducers.onSendMessage(() => {
        console.log("Message sent.");
      });

      subscribeToQueries(conn, ["SELECT * FROM message", "SELECT * FROM user"]);
    };

    const onDisconnect = () => {
      console.log("Disconnected from SpacetimeDB");
      setConnected(false);
    };

    const onConnectError = (_ctx: ErrorContext, err: Error) => {
      console.log("Error connecting to SpacetimeDB:", err);
    };

    setConn(
      DbConnection.builder()
        .withUri("ws://localhost:3000")
        .withModuleName("quickstart-chat")
        .withToken(localStorage.getItem("auth_token") || "")
        .onConnect(onConnect)
        .onDisconnect(onDisconnect)
        .onConnectError(onConnectError)
        .build()
    );
  }, []);

  return {
    connected,
    identity,
    conn,
  };
};

const useMessages = (conn: DbConnection | null): Message[] => {
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    if (!conn) return;
    const onNewMessage = (_: EventContext, message: Message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    };
    conn.db.message.onInsert(onNewMessage);

    const onDelete = (_ctx: EventContext, message: Message) => {
      setMessages((prev) =>
        prev.filter(
          (m) =>
            m.text !== message.text &&
            m.sent !== message.sent &&
            m.sender !== message.sender
        )
      );
    };
    conn.db.message.onDelete(onDelete);

    return () => {
      conn.db.message.removeOnInsert(onNewMessage);
      conn.db.message.removeOnDelete(onDelete);
    };
  }, [conn]);
  return messages;
};

function useUsers(conn: DbConnection | null): Map<string, User> {
  const [users, setUsers] = useState<Map<string, User>>(new Map());

  useEffect(() => {
    if (!conn) return;
    const onInsert = (_ctx: EventContext, user: User) => {
      setUsers((prev) => new Map(prev.set(user.identity.toHexString(), user)));
    };
    conn.db.user.onInsert(onInsert);

    const onUpdate = (_ctx: EventContext, oldUser: User, newUser: User) => {
      setUsers((prev) => {
        prev.delete(oldUser.identity.toHexString());
        return new Map(prev.set(newUser.identity.toHexString(), newUser));
      });
    };
    conn.db.user.onUpdate(onUpdate);

    const onDelete = (_ctx: EventContext, user: User) => {
      setUsers((prev) => {
        prev.delete(user.identity.toHexString());
        return new Map(prev);
      });
    };
    conn.db.user.onDelete(onDelete);

    return () => {
      conn.db.user.removeOnInsert(onInsert);
      conn.db.user.removeOnUpdate(onUpdate);
      conn.db.user.removeOnDelete(onDelete);
    };
  }, [conn]);

  return users;
}

export const App = () => {
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [newMessage, setNewMessage] = useState<string | null>(null);
  const { connected, identity, conn } = useConnection();
  const messages = useMessages(conn);
  const users = useUsers(conn);

  if (!conn || !connected || !identity) {
    return (
      <div className="App">
        <h1>Connecting...</h1>
      </div>
    );
  }
  const name = users.get(identity?.toHexString())?.name;

  return (
    <div>
      <h1>Chat App</h1>
      <h3>Chatting as: {name ?? "Unknown User"}</h3>
      <div style={{ paddingBottom: "1em" }}>
        {messages
          .sort((a, b) => (a.sent > b.sent ? 1 : -1))
          .map((message) => {
            return (
              <div
                style={{ display: "flex", flexDirection: "column" }}
                key={
                  message.sender.toHexString() +
                  message.sent.toString() +
                  message.text
                }
              >
                <p>
                  <span style={{ color: "rebeccapurple" }}>
                    {users.get(message.sender.toHexString())?.name ??
                      "Anonymous User"}
                  </span>{" "}
                  : {message.text}
                </p>
                <p style={{ fontSize: "0.5em", color: "gray" }}>
                  {message.sent.toDate().toLocaleString()}
                </p>
              </div>
            );
          })}
      </div>

      {name ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newMessage) return;
            conn.reducers.sendMessage(newMessage);
            setNewMessage(null);
          }}
          style={{ display: "flex", flexDirection: "row", gap: "8px" }}
        >
          <input
            value={newMessage ?? ""}
            type="text"
            placeholder="Enter your message"
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <button>Send Message</button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = nameRef.current?.value;
            if (!name) return;

            conn.reducers.setName(name);
          }}
          style={{ display: "flex", flexDirection: "row", gap: "8px" }}
        >
          <input type="text" placeholder="Enter your name" ref={nameRef} />
          <button type="submit">Set Name</button>
        </form>
      )}
    </div>
  );
};
