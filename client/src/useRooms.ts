import { useEffect, useState } from "react";
import { DbConnection, EventContext, Room } from "./moduleBindings";

export const useRooms = (conn: DbConnection | null): Map<bigint, string> => {
  const [rooms, setRooms] = useState<Map<bigint, string>>(new Map());

  useEffect(() => {
    if (!conn) return;
    const onInsert = (_ctx: EventContext, room: Room) => {
      setRooms((prev) => new Map(prev.set(room.id, room.name)));
    };
    conn.db.room.onInsert(onInsert);

    const onUpdate = (_ctx: EventContext, oldRoom: Room, newRoom: Room) => {
      setRooms((prev) => {
        prev.delete(oldRoom.id);
        return new Map(prev.set(newRoom.id, newRoom.name));
      });
    };
    conn.db.room.onUpdate(onUpdate);

    const onDelete = (_ctx: EventContext, room: Room) => {
      setRooms((prev) => {
        prev.delete(room.id);
        return new Map(prev);
      });
    };
    conn.db.room.onDelete(onDelete);

    return () => {
      conn.db.room.removeOnInsert(onInsert);
      conn.db.room.removeOnUpdate(onUpdate);
      conn.db.room.removeOnDelete(onDelete);
    };
  }, [conn]);

  return rooms;
};
