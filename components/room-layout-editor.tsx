"use client";

import { useMemo, useRef, useState } from "react";

type Wall = "north" | "east" | "south" | "west";
type ExistingItemStatus = "keep" | "remove";
type OpeningKind = "door" | "window";

type ExistingItem = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  status: ExistingItemStatus;
};

type Opening = {
  id: string;
  kind: OpeningKind;
  wall: Wall;
  offset: number;
  width: number;
};

type DragTarget =
  | { type: "east-wall" }
  | { type: "south-wall" }
  | { type: "item"; id: string }
  | { type: "opening"; id: string };

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 500;
const ROOM_ORIGIN = { x: 86, y: 58 };
const MIN_ROOM_FEET = 6;
const MAX_ROOM_FEET = 28;

const WALL_LABELS: Record<Wall, string> = {
  north: "N",
  east: "E",
  south: "S",
  west: "W",
};

const INITIAL_ITEMS: ExistingItem[] = [
  {
    id: "sofa",
    label: "Existing sofa",
    x: 1.1,
    y: 7.1,
    width: 6.2,
    depth: 2.7,
    status: "keep",
  },
  {
    id: "media",
    label: "Media console",
    x: 8.6,
    y: 0.7,
    width: 4.2,
    depth: 1.4,
    status: "remove",
  },
  {
    id: "plant",
    label: "Plant",
    x: 12.7,
    y: 8.9,
    width: 1.3,
    depth: 1.3,
    status: "keep",
  },
];

const INITIAL_OPENINGS: Opening[] = [
  { id: "door-main", kind: "door", wall: "south", offset: 2.2, width: 3 },
  { id: "window-main", kind: "window", wall: "north", offset: 8.1, width: 5 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatFeet(value: number) {
  return `${value.toFixed(1)} ft`;
}

function feetToPixels(value: number, scale: number) {
  return value * scale;
}

function wallLengthFeet(wall: Wall, width: number, depth: number) {
  return wall === "north" || wall === "south" ? width : depth;
}

function roomScale(width: number, depth: number) {
  return Math.min(
    (CANVAS_WIDTH - ROOM_ORIGIN.x - 58) / width,
    (CANVAS_HEIGHT - ROOM_ORIGIN.y - 60) / depth,
  );
}

function openingPosition(
  opening: Opening,
  roomWidthPx: number,
  roomDepthPx: number,
  scale: number,
) {
  const offsetPx = feetToPixels(opening.offset, scale);
  const widthPx = feetToPixels(opening.width, scale);

  switch (opening.wall) {
    case "north":
      return {
        x: ROOM_ORIGIN.x + offsetPx,
        y: ROOM_ORIGIN.y - 5,
        width: widthPx,
        height: 10,
      };
    case "south":
      return {
        x: ROOM_ORIGIN.x + offsetPx,
        y: ROOM_ORIGIN.y + roomDepthPx - 5,
        width: widthPx,
        height: 10,
      };
    case "west":
      return {
        x: ROOM_ORIGIN.x - 5,
        y: ROOM_ORIGIN.y + offsetPx,
        width: 10,
        height: widthPx,
      };
    case "east":
      return {
        x: ROOM_ORIGIN.x + roomWidthPx - 5,
        y: ROOM_ORIGIN.y + offsetPx,
        width: 10,
        height: widthPx,
      };
  }
}

function openingKindClasses(kind: OpeningKind) {
  return kind === "door"
    ? "bg-teal-400 text-black"
    : "bg-sky-400 text-black";
}

export function RoomLayoutEditor() {
  const [roomWidth, setRoomWidth] = useState(13.5);
  const [roomDepth, setRoomDepth] = useState(10.5);
  const [openings, setOpenings] = useState<Opening[]>(INITIAL_OPENINGS);
  const [items, setItems] = useState<ExistingItem[]>(INITIAL_ITEMS);
  const [activeWall, setActiveWall] = useState<Wall>("south");
  const [openingKind, setOpeningKind] = useState<OpeningKind>("door");
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const scale = roomScale(roomWidth, roomDepth);
  const roomWidthPx = feetToPixels(roomWidth, scale);
  const roomDepthPx = feetToPixels(roomDepth, scale);
  const area = Math.round(roomWidth * roomDepth);

  const planSummary = useMemo(
    () => ({
      room: {
        widthFt: Number(roomWidth.toFixed(1)),
        depthFt: Number(roomDepth.toFixed(1)),
        areaSqFt: area,
      },
      openings: openings.map((opening) => ({
        kind: opening.kind,
        wall: opening.wall,
        offsetFt: Number(opening.offset.toFixed(1)),
        widthFt: opening.width,
      })),
      existingItems: items.map((item) => ({
        label: item.label,
        status: item.status,
        xFt: Number(item.x.toFixed(1)),
        yFt: Number(item.y.toFixed(1)),
        widthFt: item.width,
        depthFt: item.depth,
      })),
    }),
    [area, items, openings, roomDepth, roomWidth],
  );

  function pointerToRoomFeet(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    const svgX = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const svgY = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

    return {
      x: (svgX - ROOM_ORIGIN.x) / scale,
      y: (svgY - ROOM_ORIGIN.y) / scale,
    };
  }

  function updateDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragTarget) return;
    const point = pointerToRoomFeet(event);

    if (dragTarget.type === "east-wall") {
      setRoomWidth(clamp(Number(point.x.toFixed(1)), MIN_ROOM_FEET, MAX_ROOM_FEET));
      return;
    }

    if (dragTarget.type === "south-wall") {
      setRoomDepth(clamp(Number(point.y.toFixed(1)), MIN_ROOM_FEET, MAX_ROOM_FEET));
      return;
    }

    if (dragTarget.type === "item") {
      setItems((current) =>
        current.map((item) => {
          if (item.id !== dragTarget.id) return item;
          return {
            ...item,
            x: clamp(Number((point.x - item.width / 2).toFixed(1)), 0, roomWidth - item.width),
            y: clamp(Number((point.y - item.depth / 2).toFixed(1)), 0, roomDepth - item.depth),
          };
        }),
      );
      return;
    }

    if (dragTarget.type === "opening") {
      setOpenings((current) =>
        current.map((opening) => {
          if (opening.id !== dragTarget.id) return opening;
          const wallPoint =
            opening.wall === "north" || opening.wall === "south" ? point.x : point.y;
          const maxOffset =
            wallLengthFeet(opening.wall, roomWidth, roomDepth) - opening.width;
          return {
            ...opening,
            offset: clamp(Number((wallPoint - opening.width / 2).toFixed(1)), 0, maxOffset),
          };
        }),
      );
    }
  }

  function addOpening() {
    const wallLength = wallLengthFeet(activeWall, roomWidth, roomDepth);
    const width = openingKind === "door" ? 3 : 4;
    const opening: Opening = {
      id: `${openingKind}-${Date.now()}`,
      kind: openingKind,
      wall: activeWall,
      offset: Math.max(0, (wallLength - width) / 2),
      width,
    };
    setOpenings((current) => [...current, opening]);
  }

  function updateRoomDimension(kind: "width" | "depth", value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const nextValue = clamp(parsed, MIN_ROOM_FEET, MAX_ROOM_FEET);
    if (kind === "width") {
      setRoomWidth(nextValue);
      return;
    }
    setRoomDepth(nextValue);
  }

  return (
    <section className="border-b border-zinc-800 bg-zinc-950/70">
      <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-teal-300">
                2D layout editor
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Room size and dimensions
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm sm:w-[360px]">
              <label className="block">
                <span className="mb-1 block text-xs text-zinc-500">Width</span>
                <input
                  type="number"
                  min={MIN_ROOM_FEET}
                  max={MAX_ROOM_FEET}
                  step="0.5"
                  value={roomWidth}
                  onChange={(event) => updateRoomDimension("width", event.target.value)}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-black px-3 text-sm text-white outline-none focus:border-teal-300"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-zinc-500">Depth</span>
                <input
                  type="number"
                  min={MIN_ROOM_FEET}
                  max={MAX_ROOM_FEET}
                  step="0.5"
                  value={roomDepth}
                  onChange={(event) => updateRoomDimension("depth", event.target.value)}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-black px-3 text-sm text-white outline-none focus:border-teal-300"
                />
              </label>
              <div>
                <span className="mb-1 block text-xs text-zinc-500">Area</span>
                <div className="flex h-10 items-center rounded-md border border-zinc-800 bg-black px-3 text-sm font-medium text-zinc-100">
                  {area} sq ft
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-zinc-800 bg-black">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              className="block aspect-[1.44/1] w-full touch-none"
              onPointerMove={updateDrag}
              onPointerUp={() => setDragTarget(null)}
              onPointerLeave={() => setDragTarget(null)}
            >
              <defs>
                <pattern
                  id="floor-grid"
                  width={scale}
                  height={scale}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${scale} 0 L 0 0 0 ${scale}`}
                    fill="none"
                    stroke="rgb(63 63 70 / 0.42)"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>

              <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#050505" />
              <rect
                x={ROOM_ORIGIN.x}
                y={ROOM_ORIGIN.y}
                width={roomWidthPx}
                height={roomDepthPx}
                fill="url(#floor-grid)"
                stroke="#f4f4f5"
                strokeWidth="4"
              />

              <line
                x1={ROOM_ORIGIN.x}
                y1={ROOM_ORIGIN.y - 28}
                x2={ROOM_ORIGIN.x + roomWidthPx}
                y2={ROOM_ORIGIN.y - 28}
                stroke="#14b8a6"
                strokeWidth="2"
              />
              <text
                x={ROOM_ORIGIN.x + roomWidthPx / 2}
                y={ROOM_ORIGIN.y - 36}
                textAnchor="middle"
                className="fill-teal-200 text-[15px] font-medium"
              >
                {formatFeet(roomWidth)}
              </text>
              <line
                x1={ROOM_ORIGIN.x - 34}
                y1={ROOM_ORIGIN.y}
                x2={ROOM_ORIGIN.x - 34}
                y2={ROOM_ORIGIN.y + roomDepthPx}
                stroke="#14b8a6"
                strokeWidth="2"
              />
              <text
                x={ROOM_ORIGIN.x - 44}
                y={ROOM_ORIGIN.y + roomDepthPx / 2}
                textAnchor="middle"
                transform={`rotate(-90 ${ROOM_ORIGIN.x - 44} ${ROOM_ORIGIN.y + roomDepthPx / 2})`}
                className="fill-teal-200 text-[15px] font-medium"
              >
                {formatFeet(roomDepth)}
              </text>

              {items.map((item) => (
                <g
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragTarget({ type: "item", id: item.id });
                  }}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <rect
                    x={ROOM_ORIGIN.x + feetToPixels(item.x, scale)}
                    y={ROOM_ORIGIN.y + feetToPixels(item.y, scale)}
                    width={feetToPixels(item.width, scale)}
                    height={feetToPixels(item.depth, scale)}
                    rx="6"
                    fill={
                      item.status === "keep"
                        ? "rgb(20 184 166 / 0.72)"
                        : "rgb(244 114 182 / 0.55)"
                    }
                    stroke={item.status === "keep" ? "#5eead4" : "#f9a8d4"}
                    strokeWidth="2"
                  />
                  <text
                    x={
                      ROOM_ORIGIN.x +
                      feetToPixels(item.x + item.width / 2, scale)
                    }
                    y={
                      ROOM_ORIGIN.y +
                      feetToPixels(item.y + item.depth / 2, scale) +
                      4
                    }
                    textAnchor="middle"
                    className="pointer-events-none fill-black text-[12px] font-semibold"
                  >
                    {item.label}
                  </text>
                </g>
              ))}

              {openings.map((opening) => {
                const position = openingPosition(
                  opening,
                  roomWidthPx,
                  roomDepthPx,
                  scale,
                );
                return (
                  <g
                    key={opening.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDragTarget({ type: "opening", id: opening.id });
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <rect
                      x={position.x}
                      y={position.y}
                      width={position.width}
                      height={position.height}
                      rx="3"
                      fill={opening.kind === "door" ? "#2dd4bf" : "#38bdf8"}
                    />
                    <text
                      x={position.x + position.width / 2}
                      y={position.y + position.height / 2 + 4}
                      textAnchor="middle"
                      className="pointer-events-none fill-black text-[11px] font-bold uppercase"
                    >
                      {opening.kind === "door" ? "D" : "W"}
                    </text>
                  </g>
                );
              })}

              <rect
                x={ROOM_ORIGIN.x + roomWidthPx - 7}
                y={ROOM_ORIGIN.y + 18}
                width="14"
                height={roomDepthPx - 36}
                rx="7"
                fill="#f97316"
                className="cursor-ew-resize"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragTarget({ type: "east-wall" });
                }}
              />
              <rect
                x={ROOM_ORIGIN.x + 18}
                y={ROOM_ORIGIN.y + roomDepthPx - 7}
                width={roomWidthPx - 36}
                height="14"
                rx="7"
                fill="#f97316"
                className="cursor-ns-resize"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragTarget({ type: "south-wall" });
                }}
              />

              {(["north", "east", "south", "west"] as Wall[]).map((wall) => {
                const positions = {
                  north: [ROOM_ORIGIN.x + roomWidthPx / 2, ROOM_ORIGIN.y + 20],
                  east: [ROOM_ORIGIN.x + roomWidthPx - 20, ROOM_ORIGIN.y + roomDepthPx / 2],
                  south: [ROOM_ORIGIN.x + roomWidthPx / 2, ROOM_ORIGIN.y + roomDepthPx - 18],
                  west: [ROOM_ORIGIN.x + 20, ROOM_ORIGIN.y + roomDepthPx / 2],
                } as const;
                return (
                  <text
                    key={wall}
                    x={positions[wall][0]}
                    y={positions[wall][1]}
                    textAnchor="middle"
                    className="fill-zinc-500 text-[12px] font-bold"
                  >
                    {WALL_LABELS[wall]}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-black p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Openings</h3>
              <button
                type="button"
                onClick={addOpening}
                className="rounded-md bg-teal-300 px-3 py-1.5 text-xs font-semibold text-black hover:bg-teal-200"
              >
                Add
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["door", "window"] as OpeningKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setOpeningKind(kind)}
                  className={`rounded-md px-3 py-2 text-xs font-semibold capitalize ${
                    openingKind === kind
                      ? openingKindClasses(kind)
                      : "border border-zinc-800 text-zinc-300 hover:border-zinc-600"
                  }`}
                >
                  {kind}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {(["north", "east", "south", "west"] as Wall[]).map((wall) => (
                <button
                  key={wall}
                  type="button"
                  onClick={() => setActiveWall(wall)}
                  className={`rounded-md px-2 py-2 text-xs font-semibold ${
                    activeWall === wall
                      ? "bg-zinc-100 text-black"
                      : "border border-zinc-800 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {WALL_LABELS[wall]}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              {openings.map((opening) => (
                <div
                  key={opening.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border border-zinc-800 px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-medium capitalize text-zinc-100">
                      {opening.kind} · {opening.wall}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatFeet(opening.offset)} from corner ·{" "}
                      {formatFeet(opening.width)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenings((current) =>
                        current.filter((candidate) => candidate.id !== opening.id),
                      )
                    }
                    className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:border-pink-300 hover:text-pink-200"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-black p-4">
            <h3 className="text-sm font-semibold text-white">Surveyed items</h3>
            <div className="mt-3 space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-zinc-800 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-zinc-100">
                        {item.label}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatFeet(item.width)} x {formatFeet(item.depth)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setItems((current) =>
                          current.map((candidate) =>
                            candidate.id === item.id
                              ? {
                                  ...candidate,
                                  status:
                                    candidate.status === "keep" ? "remove" : "keep",
                                }
                              : candidate,
                          ),
                        )
                      }
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                        item.status === "keep"
                          ? "bg-teal-300 text-black"
                          : "bg-pink-300 text-black"
                      }`}
                    >
                      {item.status}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-black p-4">
            <h3 className="text-sm font-semibold text-white">Floor plan output</h3>
            <pre className="mt-3 max-h-52 overflow-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300">
              {JSON.stringify(planSummary, null, 2)}
            </pre>
          </div>
        </aside>
      </div>
    </section>
  );
}
