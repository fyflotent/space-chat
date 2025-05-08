import { Identity } from "@clockworklabs/spacetimedb-sdk";
import { useEffect, useRef, useState } from "react";
import BurgerMenu from "./assets/burgerMenu.svg?react";
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

      subscribeToQueries(conn, [
        "SELECT * FROM room",
        "SELECT * FROM user",
        `SELECT * FROM pointer where owner != '${identity.toHexString()}'`,
      ]);
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onConnectError = (_ctx: ErrorContext, err: Error) => {
      console.error("Error connecting to SpacetimeDB:", err);
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
  const [openNav, setOpenNav] = useState(false);

  const { connected, identity, conn } = useConnection();

  const messages = useMessages(conn);
  const users = useUsers(conn);
  const rooms = useRooms(conn);
  useMyPointer(conn);
  const pointers = usePointers(conn);

  useEffect(() => {
    if (!conn || !conn.isActive || !connected) return;
    const subscription = conn
      .subscriptionBuilder()
      .subscribe(`SELECT * FROM message WHERE room = ${roomId.toString()}`);

    return () => subscription.unsubscribe();
  }, [conn, conn?.isActive, connected, roomId]);

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
        <div
          style={{
            display: "flex",
            gap: "16px",
            flexDirection: "row",
            alignItems: "center",
            borderBottom: "1px solid bisque",
          }}
        >
          <BurgerMenu
            onClick={() => setOpenNav(!openNav)}
            className="burger-menu"
          />
          <div>
            <h1>Chat</h1>
          </div>
          <p>Chatting as: {name ?? "Unknown User"}</p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: "8px",
            flex: 1,
            width: "100%",
          }}
        >
          <nav className={openNav ? "open" : "closed"}>
            <h3>Rooms</h3>
            {[...rooms.entries()].map(([id, name]) => {
              return (
                <button
                  key={id}
                  onClick={() => setRoomId(id)}
                  style={{
                    width: "100%",
                    padding: "16px",
                    border: "none",
                    backgroundColor:
                      roomId === id ? "rgba(255,228,196,0.2)" : "transparent",
                    color: "bisque",
                    textAlign: "center",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  {name}
                </button>
              );
            })}
          </nav>
          {name ? (
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
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                        key={
                          message.sender.toHexString() +
                          message.sent.toDate().toLocaleString() +
                          message.text
                        }
                      >
                        <p
                          style={{
                            fontWeight: "600",
                            verticalAlign: "center",
                          }}
                        >
                          {users.get(message.sender.toHexString())?.name ??
                            "Anonymous User"}

                          <span
                            style={{
                              fontSize: "12px",
                              color: "gray",
                              paddingLeft: "8px",
                            }}
                          >
                            {message.sent.toDate().toLocaleString()}
                          </span>
                        </p>
                        <p style={{ fontWeight: "500" }}>{message.text}</p>
                      </div>
                    );
                  })}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newMessage) return;
                  conn.reducers.onSendMessage((ctx) => {
                    if (ctx.event.status.tag === "Failed") {
                      alert("Error sending message: " + ctx.event.status.value);
                    }
                  });
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
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                flexDirection: "column",
                width: "100%",
              }}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = nameRef.current?.value;
                  if (!name) return;

                  conn.reducers.setName(name);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  width: "100%",
                  maxWidth: "300px",
                }}
              >
                <input
                  type="text"
                  placeholder="Enter your username"
                  ref={nameRef}
                  style={{}}
                />
                <button type="submit">Set Name</button>
              </form>
            </div>
          )}
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
