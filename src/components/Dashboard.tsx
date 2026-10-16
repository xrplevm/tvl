import { useMemo, useState, useRef } from "react";
import { useRows } from "../hooks/useRows";
import { Filters } from "./Filters";
import { Table } from "./Table";
import { getSwapUrl } from "../utils/getSwapUrl";
import type { Row } from "../types";
import { useMemeTokens } from "../hooks/useMemeTokens";

function Dashboard() {
  const { rows, loading } = useRows();
  const [src, setSrc] = useState("all");
  const [dst, setDst] = useState("all");
  const [sym, setSym] = useState("all");

  const [baseAsset, setBaseAsset] = useState<Row | null>(null);
  const [highlightedKey, setHighlightedKey] = useState<string | undefined>(
    undefined
  );
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Persist showMemes in localStorage
  function getPersistedBool(key: string, defaultValue = false) {
    if (typeof window === 'undefined') return defaultValue;
    const v = localStorage.getItem(key);
    return v === 'true' ? true : defaultValue;
  }
  const [showMemes, setShowMemes] = useState(() => getPersistedBool('showMemes', false));
  const { memes, loading: memesLoading } = useMemeTokens(showMemes);

  // Sync to localStorage on change
  function handleSetShowMemes(val: boolean) {
    setShowMemes(val);
    if (typeof window !== 'undefined') localStorage.setItem('showMemes', val ? 'true' : 'false');
  }

  const list = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            (src === "all" || r.source === src) &&
            (dst === "all" || r.dest === dst) &&
            (sym === "all" || r.symbol === sym)
        )
        .sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0)), // Sort by TVL descending
    [rows, src, dst, sym]
  );

  // Merge meme tokens into the list if showMemes is true
  const combinedList = useMemo(() => {
    let base = list;
    if (showMemes && memes.length > 0) {
      // Convert meme tokens to Row type (minimal for now)
      const memeRows: Row[] = memes.map((m) => {
        // Use totalSupply and decimals from meme API if available
        let normalizedQuantity = 0;
        let normalizedDecimals = 18;
        if (m.totalSupply && m.decimals !== undefined) {
          try {
            normalizedQuantity = Number(m.totalSupply) / Math.pow(10, m.decimals);
            normalizedDecimals = m.decimals;
          } catch {
            normalizedQuantity = 0;
            normalizedDecimals = 18;
          }
        }
        return {
          key: m.address,
          symbol: m.symbol,
          name: m.name,
          logo: m.logo,
          chainLogo: "", // No chain logo for memes
          quantity: normalizedQuantity, // Use normalized totalSupply as quantity
          decimals: normalizedDecimals, // Use decimals from explorer
          cg: "", // No Coingecko id
          binance: "", // No Binance symbol
          source: "XRPL EVM" as any, // Set to XRPL EVM
          dest: "XRPL EVM" as any,   // Set to XRPL EVM
          // Use priceUsd as string to preserve all decimals, but parse as number for Row type
          priceUsd: m.priceUsd ? Number(m.priceUsd) : 0,
          valueUsd: Number(m.marketCap),
        };
      });
      // Avoid duplicates by address
      const existingKeys = new Set(base.map((r) => r.key));
      base = [...base, ...memeRows.filter((r) => !existingKeys.has(r.key))];
    }
    // Sort by TVL descending after merging
    return base.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));
  }, [list, showMemes, memes]);

  // Build filter options including memes if present
  const allSources = useMemo(() => {
    const baseSources = new Set(rows.map((r) => r.source));
    if (showMemes && memes.length > 0) baseSources.add("Memes" as any);
    return ["all", ...Array.from(baseSources)];
  }, [rows, showMemes, memes]);
  const allDests = useMemo(() => {
    const baseDests = new Set(rows.map((r) => r.dest));
    if (showMemes && memes.length > 0) baseDests.add("-" as any);
    return ["all", ...Array.from(baseDests)];
  }, [rows, showMemes, memes]);
  const allSymbols = useMemo(() => {
    const baseSymbols = new Set(rows.map((r) => r.symbol));
    if (showMemes && memes.length > 0)
      memes.forEach((m) => baseSymbols.add(m.symbol));
    return ["all", ...Array.from(baseSymbols)];
  }, [rows, showMemes, memes]);

  // Use filter values to filter combinedList
  const filteredList = useMemo(
    () =>
      combinedList.filter(
        (r) =>
          (src === "all" || r.source === src) &&
          (dst === "all" || r.dest === dst) &&
          (sym === "all" || r.symbol === sym)
      ),
    [combinedList, src, dst, sym]
  );

  // Compute filtered total TVL (sum of valueUsd for filtered rows)
  const filteredTotal = useMemo(
    () =>
      filteredList.reduce(
        (sum, r) =>
          sum +
          (typeof r.valueUsd === "number" && !isNaN(r.valueUsd)
            ? r.valueUsd
            : 0),
        0
      ),
    [filteredList]
  );

  function handleRowClick(row: Row) {
    if (!baseAsset) {
      setBaseAsset(row);
      setHighlightedKey(row.key);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setBaseAsset(null);
        setHighlightedKey(undefined);
      }, 5000);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const url = getSwapUrl(baseAsset, row);
      window.open(url, "_blank");
      setBaseAsset(null);
      setHighlightedKey(undefined);
    }
  }

  return (
    <div className="max-w-7xl mx-auto py-5 font-work text-white px-1 text-base md:text-lg">
      <h2 className="text-center text-2xl md:text-4xl font-extrabold text-lightPurple mb-8 md:mb-10">
        XRPL EVM ecosystem TVL
      </h2>
      <p className="text-center text-green text-3xl md:text-5xl mb-6 md:mb-8 min-h-[3.5rem] flex items-center justify-center">
        {loading ? (
          <span
            className="inline-block animate-spin mr-2 align-middle"
            style={{
              width: "1.5rem",
              height: "1.5rem",
              border: "2px solid #32E685",
              borderTop: "4px solid transparent",
              borderRadius: "50%",
            }}
          ></span>
        ) : (
          "$" +
          filteredTotal.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })
        )}
      </p>

      {/* filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-4 justify-center mb-4 md:mb-6 text-sm md:text-base min-w-xl mx-auto">
        <Filters
          label="Source"
          value={src}
          onChange={setSrc}
          opts={allSources}
        />
        <Filters
          label="Destination"
          value={dst}
          onChange={setDst}
          opts={allDests}
        />
        <Filters
          label="Symbol"
          value={sym}
          onChange={setSym}
          opts={allSymbols}
        />
      </div>
      {/* memes checkbox */}
      <div className="flex items-center gap-4 mb-4">
        <label className="flex items-center gap-2 cursor-pointer select-none px-4 py-2 rounded-lg bg-darkPurple/80 hover:bg-darkPurple/60 transition-colors border border-lightPurple/30 shadow-sm relative">
          <span className="relative w-5 h-5 flex items-center justify-center">
            <input
              type="checkbox"
              checked={showMemes}
              onChange={(e) => handleSetShowMemes(e.target.checked)}
              className="appearance-none w-5 h-5 rounded border-2 border-lightPurple bg-black checked:bg-gradient-to-br checked:from-green checked:to-lightPurple focus:ring-0 focus:outline-none transition-all duration-200 peer"
            />
            {/* Custom checkmark icon absolutely centered in the box */}
            {showMemes && (
              <svg className="absolute left-0 top-0 w-5 h-5 pointer-events-none" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 9.5L8 13L14 6" stroke="#32E685" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </span>
          <span className="text-lightPurple font-semibold tracking-wide pl-2">Memes</span>
        </label>
        {(showMemes && memesLoading) && (
          <span className="text-xs text-gray-400">Loading memes...</span>
        )}
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <Table
          rows={filteredList}
          loading={loading || memesLoading}
          onRowClick={handleRowClick}
          highlightedKey={highlightedKey}
        />
      </div>
    </div>
  );
}
export default Dashboard;
