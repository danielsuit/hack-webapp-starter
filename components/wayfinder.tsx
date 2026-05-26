"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  Candidate,
  CurateResponse,
  DetectedItem,
  ParseResponse,
  ShopResponse,
  StyleProfile,
} from "@/lib/schemas";

type Stage = "empty" | "parsing" | "parsed" | "shopping" | "curating" | "final";

type SlotStatus =
  | { kind: "pending" }
  | { kind: "loading" }
  | { kind: "ok"; result: ShopResponse }
  | { kind: "error"; message: string };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function styleContextString(profile: StyleProfile): string {
  return `${profile.era_or_style}; ${profile.formality}; materials: ${profile.materials.join(", ")}; keywords: ${profile.style_keywords.join(", ")}; palette: ${profile.palette.join(", ")}`;
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function fakeRating(url: string): { stars: number; count: number } {
  const seed = hashSeed(url);
  const stars = 4 + ((seed % 10) / 10) * 0.9; // 4.0 - 4.9
  const count = 50 + (seed % 4000);
  return { stars: Math.round(stars * 10) / 10, count };
}

export function WayFinder() {
  const [stage, setStage] = useState<Stage>("empty");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [parse, setParse] = useState<ParseResponse | null>(null);
  const [items, setItems] = useState<DetectedItem[]>([]);
  const [slotStatus, setSlotStatus] = useState<Record<string, SlotStatus>>({});
  const [curate, setCurate] = useState<CurateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStage("empty");
    setImageDataUrl(null);
    setParse(null);
    setItems([]);
    setSlotStatus({});
    setCurate(null);
    setError(null);
  };

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      setImageDataUrl(dataUrl);
      setStage("parsing");
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Parse failed (${response.status})`);
      }
      const data = (await response.json()) as ParseResponse;
      setParse(data);
      setItems(data.detected_items);
      setStage("parsed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something broke");
      setStage("empty");
    }
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const startShopping = async () => {
    if (!parse || !imageDataUrl || items.length === 0) return;
    setError(null);
    setStage("shopping");

    const initial: Record<string, SlotStatus> = {};
    for (const item of items) initial[item.slot_id] = { kind: "loading" };
    setSlotStatus(initial);

    const styleCtx = styleContextString(parse.style_profile);

    const results = await Promise.allSettled(
      items.map(async (item) => {
        const response = await fetch("/api/shop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item, style_context: styleCtx }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? `Shop failed (${response.status})`);
        }
        return (await response.json()) as ShopResponse;
      }),
    );

    const next: Record<string, SlotStatus> = {};
    const successes: ShopResponse[] = [];
    results.forEach((result, i) => {
      const slotId = items[i].slot_id;
      if (result.status === "fulfilled") {
        next[slotId] = { kind: "ok", result: result.value };
        if (result.value.candidates.length > 0) successes.push(result.value);
      } else {
        next[slotId] = {
          kind: "error",
          message:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        };
      }
    });
    setSlotStatus(next);

    if (successes.length === 0) {
      setError("Shopping failed for every slot. Check the server logs.");
      return;
    }

    setStage("curating");
    try {
      const response = await fetch("/api/curate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, shopResults: successes }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Curate failed (${response.status})`);
      }
      const data = (await response.json()) as CurateResponse;
      setCurate(data);
      setStage("final");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Curation failed");
      setStage("shopping");
    }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white">
      <Header stage={stage} onReset={reset} />

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-center text-sm text-red-700">
          {error}
        </div>
      )}

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-8">
        {stage === "empty" && (
          <EmptyState
            inputRef={fileInputRef}
            onFile={handleFile}
            onDrop={handleDrop}
          />
        )}

        {stage === "parsing" && imageDataUrl && (
          <ParsingState imageDataUrl={imageDataUrl} />
        )}

        {(stage === "parsed" ||
          stage === "shopping" ||
          stage === "curating" ||
          stage === "final") &&
          parse &&
          imageDataUrl && (
            <ReviewAndResults
              stage={stage}
              imageDataUrl={imageDataUrl}
              profile={parse.style_profile}
              items={items}
              slotStatus={slotStatus}
              curate={curate}
              onRemoveItem={(slotId) =>
                setItems((current) =>
                  current.filter((item) => item.slot_id !== slotId),
                )
              }
              onStartShopping={startShopping}
            />
          )}
      </main>

      <footer className="border-t border-[#e3e3e6] bg-[#f6f6f8] py-4 text-center text-xs text-[#5a5a5a]">
        Inspired by Wayfair · Built on Subconscious · Search by Tavily
      </footer>
    </div>
  );
}

function WordmarkLogo() {
  return (
    <div className="flex items-baseline">
      <span className="text-2xl font-bold tracking-tight text-[#7b189f]">
        way<span className="text-[#1f1f1f]">finder</span>
      </span>
      <svg
        viewBox="0 0 24 24"
        className="ml-0.5 h-3 w-3 -translate-y-1.5 fill-[#f6b418]"
        aria-hidden
      >
        <path d="M12 0 L14 9 L23 11 L14 13 L12 22 L10 13 L1 11 L10 9 Z" />
      </svg>
    </div>
  );
}

function Header({ stage, onReset }: { stage: Stage; onReset: () => void }) {
  return (
    <header className="border-b border-[#e3e3e6] bg-white">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-3 hover:opacity-80"
        >
          <WordmarkLogo />
        </button>

        <div className="hidden flex-1 max-w-2xl items-center rounded-md border border-[#e3e3e6] bg-[#f6f6f8] px-3 py-2 text-sm text-[#5a5a5a] md:flex">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-2 h-4 w-4"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span className="truncate">
            {stage === "empty"
              ? "Drop a photo to begin"
              : stage === "parsing"
                ? "Reading the room…"
                : stage === "parsed"
                  ? "Review your detected pieces"
                  : stage === "shopping" || stage === "curating"
                    ? "Searching Wayfair in parallel"
                    : "Your cart is ready"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {stage !== "empty" && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#7b189f] hover:bg-[#f6ecf9]"
            >
              Start over
            </button>
          )}
          <div className="flex items-center gap-1.5 rounded-md border border-[#e3e3e6] px-3 py-1.5 text-sm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-[#1f1f1f]"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
            </svg>
            <span className="text-xs font-medium tabular-nums">
              {stage === "final" ? "Checkout" : "Cart"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function EmptyState({
  inputRef,
  onFile,
  onDrop,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
  onDrop: (event: React.DragEvent<HTMLLabelElement>) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-12">
      <div className="mb-8 max-w-xl text-center">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#7b189f]/30 bg-[#f6ecf9] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#7b189f]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#7b189f]" />
          New · AI Stylist
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-[#1f1f1f]">
          Find the look. Get the cart.
        </h1>
        <p className="mt-3 text-base text-[#5a5a5a]">
          Drop one photo of a room you love. Four AI agents extract the visual
          DNA, identify each piece, and assemble a real Wayfair cart that
          matches.
        </p>
      </div>

      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className="group flex w-full max-w-xl cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#e3e3e6] bg-[#f6f6f8] px-6 py-14 transition hover:border-[#7b189f] hover:bg-[#f6ecf9]"
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-[#7b189f] ring-1 ring-[#e3e3e6] transition group-hover:ring-[#7b189f]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-[#1f1f1f]">
          Drag a photo here, or click to choose
        </p>
        <p className="text-xs text-[#5a5a5a]">JPG · PNG · WebP up to 10 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </label>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-[#5a5a5a]">
        <ValueProp
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
          label="Real Wayfair links"
        />
        <ValueProp
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          label="Under 60 seconds"
        />
        <ValueProp
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
            >
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
          }
          label="One-click checkout"
        />
      </div>
    </div>
  );
}

function ValueProp({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[#5a5a5a]">
      <span className="text-[#7b189f]">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function ParsingState({ imageDataUrl }: { imageDataUrl: string }) {
  return (
    <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="overflow-hidden rounded-xl border border-[#e3e3e6] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageDataUrl}
          alt="Inspiration"
          className="h-full max-h-[640px] w-full object-cover"
        />
      </div>
      <div className="flex flex-col items-start justify-center gap-4 rounded-xl border border-[#e3e3e6] bg-[#f6f6f8] p-8">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#7b189f]">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7b189f] opacity-60"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#7b189f]"></span>
          </span>
          Reading the room
        </div>
        <p className="text-lg text-[#1f1f1f]">
          Extracting palette, materials, era — and naming each piece you'd
          need to recreate this look.
        </p>
        <ul className="mt-2 space-y-2 text-sm text-[#5a5a5a]">
          <li className="flex items-center gap-2">
            <DotCheck /> Sampling colors and finishes
          </li>
          <li className="flex items-center gap-2">
            <DotCheck /> Identifying hero furniture
          </li>
          <li className="flex items-center gap-2">
            <DotCheck /> Estimating price band per slot
          </li>
        </ul>
      </div>
    </div>
  );
}

function DotCheck() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0f8050]/15 text-[#0f8050]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

function ReviewAndResults({
  stage,
  imageDataUrl,
  profile,
  items,
  slotStatus,
  curate,
  onRemoveItem,
  onStartShopping,
}: {
  stage: Stage;
  imageDataUrl: string;
  profile: StyleProfile;
  items: DetectedItem[];
  slotStatus: Record<string, SlotStatus>;
  curate: CurateResponse | null;
  onRemoveItem: (slotId: string) => void;
  onStartShopping: () => void;
}) {
  const heroSize =
    stage === "final"
      ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      : stage === "shopping" || stage === "curating"
        ? "lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]"
        : "lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)]";

  return (
    <div className={`grid flex-1 gap-8 ${heroSize}`}>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-[#e3e3e6] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl}
            alt="Inspiration"
            className="h-full w-full object-cover"
          />
        </div>
        {stage !== "final" && (
          <StyleProfileCard profile={profile} compact={stage !== "parsed"} />
        )}
      </div>

      <div className="min-w-0">
        {stage === "parsed" && (
          <ParsedPanel
            items={items}
            onRemoveItem={onRemoveItem}
            onStartShopping={onStartShopping}
          />
        )}
        {(stage === "shopping" || stage === "curating") && (
          <ShoppingPanel
            items={items}
            slotStatus={slotStatus}
            curating={stage === "curating"}
          />
        )}
        {stage === "final" && curate && (
          <FinalCartPanel curate={curate} items={items} />
        )}
      </div>
    </div>
  );
}

function StyleProfileCard({
  profile,
  compact,
}: {
  profile: StyleProfile;
  compact: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#e3e3e6] bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7b189f]">
          Style profile
        </p>
        <p className="text-sm font-semibold text-[#1f1f1f]">
          {profile.era_or_style}
        </p>
      </div>
      <p className="mt-0.5 text-xs text-[#5a5a5a] capitalize">{profile.formality}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {profile.palette.map((hex) => (
          <div
            key={hex}
            className="flex items-center gap-1.5 rounded-full border border-[#e3e3e6] bg-[#f6f6f8] px-2 py-1"
          >
            <span
              className="h-3 w-3 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: hex }}
            />
            <span className="font-mono text-[10px] uppercase text-[#5a5a5a]">
              {hex}
            </span>
          </div>
        ))}
      </div>
      {!compact && (
        <div className="mt-4 space-y-3">
          <ChipRow label="Materials" values={profile.materials} />
          <ChipRow label="Keywords" values={profile.style_keywords} />
        </div>
      )}
    </div>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#5a5a5a]">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full bg-[#f6f6f8] px-2.5 py-0.5 text-[11px] font-medium text-[#1f1f1f]"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function ParsedPanel({
  items,
  onRemoveItem,
  onStartShopping,
}: {
  items: DetectedItem[];
  onRemoveItem: (slotId: string) => void;
  onStartShopping: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-[#e3e3e6] bg-white">
      <div className="border-b border-[#e3e3e6] px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7b189f]">
          Detected items
        </p>
        <p className="mt-1 text-sm font-semibold text-[#1f1f1f]">
          {items.length} piece{items.length === 1 ? "" : "s"} to shop
        </p>
        <p className="mt-0.5 text-xs text-[#5a5a5a]">
          Remove anything you already own.
        </p>
      </div>
      <ul className="flex-1 divide-y divide-[#eeeef1] overflow-auto">
        {items.map((item) => (
          <li
            key={item.slot_id}
            className="group flex items-start gap-4 px-5 py-3.5 hover:bg-[#f9f9fb]"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#f6ecf9] text-xs font-bold uppercase text-[#7b189f]">
              {item.category.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold capitalize text-[#1f1f1f]">
                  {item.category}
                </p>
                <PriceBandBadge band={item.price_band} />
              </div>
              <p className="mt-0.5 text-xs text-[#5a5a5a]">
                {item.descriptors.join(" · ")}
              </p>
              {item.approximate_dimensions && (
                <p className="mt-0.5 text-[11px] text-[#9a9a9e]">
                  {item.approximate_dimensions}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onRemoveItem(item.slot_id)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-[#7b189f] opacity-0 hover:bg-[#f6ecf9] group-hover:opacity-100"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-[#e3e3e6] bg-[#f6f6f8] p-5">
        <button
          type="button"
          onClick={onStartShopping}
          disabled={items.length === 0}
          className="w-full rounded-md bg-[#1f1f1f] px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#9a9a9e]"
        >
          Shop these on Wayfair
        </button>
        <p className="mt-2 text-center text-[10px] uppercase tracking-wider text-[#0f8050]">
          ★ Free shipping over $35
        </p>
      </div>
    </div>
  );
}

function PriceBandBadge({ band }: { band: string }) {
  const styles =
    band === "premium"
      ? "bg-[#1f1f1f] text-white"
      : band === "mid"
        ? "bg-[#f6ecf9] text-[#7b189f]"
        : "bg-[#f6f6f8] text-[#5a5a5a]";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles}`}
    >
      {band}
    </span>
  );
}

function ShoppingPanel({
  items,
  slotStatus,
  curating,
}: {
  items: DetectedItem[];
  slotStatus: Record<string, SlotStatus>;
  curating: boolean;
}) {
  const doneCount = items.filter((item) => {
    const status = slotStatus[item.slot_id];
    return status?.kind === "ok" || status?.kind === "error";
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7b189f]">
            {curating ? "Curating cart" : "Searching Wayfair"}
          </p>
          <h2 className="mt-1 text-lg font-bold text-[#1f1f1f]">
            {curating
              ? "All shoppers reported back — picking the final cart…"
              : `${items.length} agents searching in parallel`}
          </h2>
          <p className="mt-0.5 text-xs text-[#5a5a5a]">
            {doneCount} of {items.length} slots resolved
          </p>
        </div>
        {curating && (
          <span className="inline-flex items-center gap-2 rounded-full border border-[#7b189f]/30 bg-[#f6ecf9] px-3 py-1.5 text-xs font-semibold text-[#7b189f]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7b189f]" />
            Curator at work
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <ShopperTile
            key={item.slot_id}
            item={item}
            status={slotStatus[item.slot_id] ?? { kind: "pending" }}
          />
        ))}
      </div>
    </div>
  );
}

function ShopperTile({
  item,
  status,
}: {
  item: DetectedItem;
  status: SlotStatus;
}) {
  const candidates =
    status.kind === "ok" ? status.result.candidates : [];
  const headline = candidates[0];

  return (
    <div className="overflow-hidden rounded-xl border border-[#e3e3e6] bg-white transition hover:shadow-md">
      <div className="flex items-center justify-between border-b border-[#eeeef1] px-3 py-2">
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-[#5a5a5a]">
          {item.category}
        </p>
        <StatusBadge status={status} />
      </div>

      {status.kind === "loading" && (
        <div className="space-y-3 p-3">
          <div className="aspect-square w-full animate-pulse rounded-lg bg-[#f6f6f8]" />
          <div className="h-3 w-3/4 animate-pulse rounded-full bg-[#f6f6f8]" />
          <div className="h-3 w-1/2 animate-pulse rounded-full bg-[#f6f6f8]" />
        </div>
      )}

      {(status.kind === "error" ||
        (status.kind === "ok" && candidates.length === 0)) && (
        <div className="grid h-full place-items-center p-6 text-center">
          <p className="text-xs text-[#5a5a5a]">
            No match — try a wider room photo or remove this slot.
          </p>
        </div>
      )}

      {status.kind === "ok" && headline && (
        <div className="p-3">
          <ProductCard candidate={headline} />
          {candidates.length > 1 && (
            <div className="mt-3 border-t border-[#eeeef1] pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#5a5a5a]">
                Also considered
              </p>
              <div className="grid grid-cols-2 gap-2">
                {candidates.slice(1).map((candidate) => (
                  <MiniProduct
                    key={candidate.product_url}
                    candidate={candidate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SlotStatus }) {
  if (status.kind === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#7b189f]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7b189f]" />
        Searching
      </span>
    );
  }
  if (status.kind === "ok") {
    const count = status.result.candidates.length;
    if (count === 0)
      return <span className="text-[11px] text-[#9a9a9e]">No match</span>;
    return (
      <span className="text-[11px] font-semibold text-[#0f8050]">
        {count} found
      </span>
    );
  }
  if (status.kind === "error") {
    return <span className="text-[11px] text-[#9a9a9e]">No match</span>;
  }
  return null;
}

function StarRating({ url }: { url: string }) {
  const { stars, count } = useMemo(() => fakeRating(url), [url]);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <svg
            key={i}
            viewBox="0 0 24 24"
            className={`h-3 w-3 ${i < Math.round(stars) ? "fill-[#f6b418]" : "fill-[#e3e3e6]"}`}
          >
            <path d="M12 0 L14 9 L23 11 L14 13 L12 22 L10 13 L1 11 L10 9 Z" />
          </svg>
        ))}
      </div>
      <span className="text-[10px] font-medium text-[#1f1f1f]">{stars}</span>
      <span className="text-[10px] text-[#5a5a5a]">({count})</span>
    </div>
  );
}

function ProductCard({ candidate }: { candidate: Candidate }) {
  return (
    <a
      href={candidate.product_url}
      target="_blank"
      rel="noreferrer"
      className="block"
    >
      <div className="relative">
        {candidate.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={candidate.image_url}
            alt={candidate.title}
            className="aspect-square w-full rounded-lg bg-[#f6f6f8] object-cover"
          />
        ) : (
          <div className="grid aspect-square w-full place-items-center rounded-lg bg-[#f6f6f8] text-[11px] uppercase tracking-wider text-[#9a9a9e]">
            No image
          </div>
        )}
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-[#5a5a5a] shadow-sm hover:text-[#d62828]"
          aria-label="Save"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-3.5 w-3.5"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>
      <div className="mt-2.5">
        <p className="line-clamp-2 text-sm leading-snug text-[#1f1f1f] hover:underline">
          {candidate.title}
        </p>
        <p className="mt-1 text-lg font-bold tabular-nums text-[#1f1f1f]">
          {fmtUSD(candidate.price_usd)}
        </p>
        <StarRating url={candidate.product_url} />
        <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#0f8050]">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-3 w-3"
          >
            <path d="M3 7h11v7H3zM14 10h4l3 3v4h-7z" />
            <circle cx="7" cy="17" r="2" fill="white" stroke="currentColor" />
            <circle cx="17" cy="17" r="2" fill="white" stroke="currentColor" />
          </svg>
          Free shipping
        </p>
        <p className="mt-2 line-clamp-2 text-[11px] italic text-[#5a5a5a]">
          {candidate.match_rationale}
        </p>
      </div>
    </a>
  );
}

function MiniProduct({ candidate }: { candidate: Candidate }) {
  return (
    <a
      href={candidate.product_url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-md border border-[#eeeef1] p-2 hover:border-[#7b189f]/40"
    >
      {candidate.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={candidate.image_url}
          alt={candidate.title}
          className="h-14 w-full rounded bg-[#f6f6f8] object-cover"
        />
      ) : (
        <div className="h-14 w-full rounded bg-[#f6f6f8]" />
      )}
      <p className="mt-1.5 line-clamp-1 text-[11px] text-[#1f1f1f]">
        {candidate.title}
      </p>
      <p className="text-[11px] font-bold tabular-nums">
        {fmtUSD(candidate.price_usd)}
      </p>
    </a>
  );
}

function FinalCartPanel({
  curate,
  items,
}: {
  curate: CurateResponse;
  items: DetectedItem[];
}) {
  const slotMap = new Map(items.map((item) => [item.slot_id, item]));
  const subtotal = curate.total_price_usd;
  const shipping = 0;
  const tax = Math.round(subtotal * 0.0625 * 100) / 100;
  const total = subtotal + shipping + tax;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-xl border border-[#e3e3e6] bg-white">
        <div className="border-b border-[#e3e3e6] px-5 py-4">
          <div className="flex items-baseline gap-2">
            <h2 className="text-2xl font-bold text-[#1f1f1f]">Cart</h2>
            <span className="text-sm text-[#5a5a5a]">
              ({curate.cart.length} item{curate.cart.length === 1 ? "" : "s"})
            </span>
          </div>
        </div>

        <ul className="divide-y divide-[#eeeef1]">
          {curate.cart.map((entry) => {
            const item = slotMap.get(entry.slot_id);
            return (
              <li key={entry.slot_id} className="flex gap-4 px-5 py-4">
                <div className="shrink-0">
                  {entry.selected.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.selected.image_url}
                      alt={entry.selected.title}
                      className="h-20 w-20 rounded-md border border-[#e3e3e6] bg-[#f6f6f8] object-cover"
                    />
                  ) : (
                    <div className="grid h-20 w-20 place-items-center rounded-md border border-[#e3e3e6] bg-[#f6f6f8] text-[9px] uppercase tracking-wider text-[#9a9a9e]">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5a5a5a]">
                    {item?.category ?? entry.slot_id}
                  </p>
                  <a
                    href={entry.selected.product_url}
                    target="_blank"
                    rel="noreferrer"
                    className="line-clamp-2 text-sm font-medium text-[#1f1f1f] hover:text-[#7b189f] hover:underline"
                  >
                    {entry.selected.title}
                  </a>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#0f8050]">
                    Free shipping
                  </p>
                  <div className="mt-1.5 flex gap-3 text-[11px]">
                    <button type="button" className="text-[#7b189f] hover:underline">
                      Save for later
                    </button>
                    <span className="text-[#e3e3e6]">·</span>
                    <button type="button" className="text-[#5a5a5a] hover:text-[#1f1f1f] hover:underline">
                      Remove
                    </button>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-bold tabular-nums text-[#1f1f1f]">
                    {fmtUSD(entry.selected.price_usd)}
                  </p>
                  <p className="mt-0.5 text-[10px] italic text-[#5a5a5a]">
                    {entry.reason.length > 60
                      ? entry.reason.slice(0, 60) + "…"
                      : entry.reason}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-[#e3e3e6] bg-[#f6f6f8] px-5 py-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#5a5a5a]">Subtotal</dt>
              <dd className="font-medium tabular-nums">{fmtUSD(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#5a5a5a]">Shipping</dt>
              <dd className="font-semibold tabular-nums text-[#0f8050]">FREE</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#5a5a5a]">Est. tax</dt>
              <dd className="font-medium tabular-nums">{fmtUSD(tax)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-[#e3e3e6] pt-2 text-base font-bold">
              <dt>Estimated total</dt>
              <dd className="tabular-nums">{fmtUSD(total)}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="mt-4 w-full rounded-md bg-[#1f1f1f] px-4 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-black"
          >
            Proceed to checkout
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-md border border-[#1f1f1f] bg-white px-4 py-2.5 text-sm font-semibold text-[#1f1f1f] hover:bg-[#f6f6f8]"
          >
            Continue shopping
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[#7b189f]/30 bg-[#f6ecf9] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7b189f]">
          Stylist notes
        </p>
        <p className="mt-2 text-sm italic text-[#1f1f1f]">
          {curate.coherence_notes}
        </p>
      </div>
    </div>
  );
}
