import { useEffect, useState } from "react";
import { DbConnection, EventContext, Pointer } from "./moduleBindings";

const useTrackWindowSize = () => {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return windowSize;
};

const normalizeXY = (
  x: number,
  y: number,
  windowSize: { width: number; height: number }
): { x: number; y: number } => {
  const normalizedX = (x / windowSize.width) * 100;
  const normalizedY = (y / windowSize.height) * 100;
  return { x: normalizedX, y: normalizedY };
};
const denormalizeXY = (
  x: number,
  y: number,
  windowSize: { width: number; height: number }
): { x: number; y: number } => {
  const denormalizedX = (x / 100) * windowSize.width;
  const denormalizedY = (y / 100) * windowSize.height;
  return { x: denormalizedX, y: denormalizedY };
};

export const useMyPointer = (conn: DbConnection | null) => {
  const windowSize = useTrackWindowSize();

  useEffect(() => {
    if (!conn) return;
    const handleMouseMove = (event: MouseEvent) => {
      const { x: normalizedX, y: normalizedY } = normalizeXY(
        event.clientX,
        event.clientY,
        windowSize
      );

      conn.reducers.setPointerPosition(normalizedX, normalizedY);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [conn, windowSize]);
};

export const usePointers = (
  conn: DbConnection | null
): Map<string, Pointer> => {
  const windowSize = useTrackWindowSize();
  const [pointers, setPointers] = useState<Map<string, Pointer>>(new Map());
  useEffect(() => {
    if (!conn) return;
    const onInsert = (_ctx: EventContext, pointer: Pointer) => {
      // denormalize db pointer position
      const { x: denormalizedX, y: denormalizedY } = denormalizeXY(
        pointer.positionX,
        pointer.positionY,
        windowSize
      );
      setPointers(
        (prev) =>
          new Map(
            prev.set(pointer.owner.toHexString(), {
              ...pointer,
              positionX: denormalizedX,
              positionY: denormalizedY,
            })
          )
      );
    };
    conn.db.pointer.onInsert(onInsert);

    const onUpdate = (
      _ctx: EventContext,
      oldPointer: Pointer,
      newPointer: Pointer
    ) => {
      setPointers((prev) => {
        // denormalize db pointer position
        const { x: denormalizedX, y: denormalizedY } = denormalizeXY(
          newPointer.positionX,
          newPointer.positionY,
          windowSize
        );
        prev.delete(oldPointer.owner.toHexString());
        return new Map(
          prev.set(newPointer.owner.toHexString(), {
            ...newPointer,
            positionX: denormalizedX,
            positionY: denormalizedY,
          })
        );
      });
    };
    conn.db.pointer.onUpdate(onUpdate);

    const onDelete = (_ctx: EventContext, pointer: Pointer) => {
      setPointers((prev) => {
        prev.delete(pointer.owner.toHexString());
        return new Map(prev);
      });
    };
    conn.db.pointer.onDelete(onDelete);

    return () => {
      conn.db.pointer.removeOnInsert(onInsert);
      conn.db.pointer.removeOnUpdate(onUpdate);
      conn.db.pointer.removeOnDelete(onDelete);
    };
  }, [conn, windowSize]);

  return pointers;
};
