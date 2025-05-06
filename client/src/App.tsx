import { Identity } from "@clockworklabs/spacetimedb-sdk";
import { useEffect, useRef, useState } from "react";
import { DbConnection, ErrorContext } from "./moduleBindings";
import { useMessages } from "./useMessages";
import { useMyPointer, usePointers } from "./usePointer";
import { useRooms } from "./useRooms";
import { useUsers } from "./useUsers";

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

      subscribeToQueries(conn, [
        "SELECT * FROM room",
        "SELECT * FROM user",
        `SELECT * FROM pointer where owner != '${identity.toHexString()}'`,
      ]);
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

export const App = () => {
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [roomId, setRoomId] = useState<bigint>(BigInt(1));
  const [newMessage, setNewMessage] = useState<string>("");

  const { connected, identity, conn } = useConnection();

  const messages = useMessages(conn);
  const users = useUsers(conn);
  const rooms = useRooms(conn);
  useMyPointer(conn);
  const pointers = usePointers(conn);

  useEffect(() => {
    if (!conn || !connected) return;

    const subscription = conn
      .subscriptionBuilder()
      .subscribe(`SELECT * FROM message WHERE room = ${roomId.toString()}`);

    return () => subscription.unsubscribe();
  }, [conn, connected, roomId]);

  if (!conn || !connected || !identity) {
    return (
      <div className="App">
        <h1>Connecting...</h1>
      </div>
    );
  }
  const name = users.get(identity?.toHexString())?.name;

  return (
    <>
      <div
        style={{
          padding: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          height: "calc(100vh - 16px)",
        }}
      >
        <h1>Chat App</h1>
        <h3>Chatting as: {name ?? "Unknown User"}</h3>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: "8px",
            flex: 1,
            width: "100%",
          }}
        >
          <nav
            style={{
              borderRight: "1px solid bisque",
              padding: "8px",
              gap: "8px",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              maxWidth: "200px",
            }}
          >
            <h3>Rooms</h3>
            <hr style={{ borderColor: "rgba(255,228,196,0.2)", margin: 0 }} />
            {[...rooms.entries()].map(([id, name]) => {
              return (
                <div key={id}>
                  <button
                    onClick={() => setRoomId(id)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "none",
                      backgroundColor: "transparent",
                      color: "bisque",
                      textAlign: "center",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    {name}
                  </button>
                  <hr
                    style={{ borderColor: "rgba(255,228,196,0.2)", margin: 0 }}
                  />
                </div>
              );
            })}
          </nav>
          <div
            style={{
              flex: 1,
              flexDirection: "column",
              display: "flex",
              gap: "16px",
            }}
          >
            <div
              style={{
                overflowY: "scroll",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                flex: 1,
                justifyContent: "flex-end",
              }}
            >
              {messages
                .sort((a, b) => (a.sent > b.sent ? 1 : -1))
                .map((message) => {
                  return (
                    <div
                      style={{ display: "flex", flexDirection: "column" }}
                      key={
                        message.sender.toHexString() +
                        message.sent.toDate().toLocaleString() +
                        message.text
                      }
                    >
                      <p>
                        <span style={{ color: "bisque" }}>
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
                  console.log("Sending message:", newMessage, roomId);
                  conn.reducers.sendMessage(newMessage, roomId);
                  setNewMessage("");
                }}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: "8px",
                  width: "100%",
                }}
              >
                <input
                  value={newMessage ?? ""}
                  type="text"
                  placeholder="Enter your message"
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={{ flex: 1 }}
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
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: "8px",
                  width: "100%",
                }}
              >
                <input
                  type="text"
                  placeholder="Enter your name"
                  ref={nameRef}
                  style={{ flex: 1 }}
                />
                <button type="submit">Set Name</button>
              </form>
            )}
          </div>
        </div>
      </div>

      {[...pointers.entries()].map(([id, pointer]) => {
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              left: pointer.positionX,
              top: pointer.positionY,
              backgroundColor: "bisque",
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              opacity: 0.5,
            }}
          ></div>
        );
      })}
    </>
  );
};
