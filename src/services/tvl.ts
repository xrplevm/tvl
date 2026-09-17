import { getAssets } from "../config/assets";
import { CHAINS } from "../config/chains";
import type { Row, Destination } from "../types";

const API_EXPLORER = "https://explorer.xrplevm.org/api/v2/tokens";

async function peersystSupply(addr: string) {
  try {
    const res = await fetch(`${API_EXPLORER}/${addr}`);
    if (!res.ok) return "0";
    const j = await res.json();
    return j.total_supply ?? "0";
  } catch {
    return "0";
  }
}

async function cosmosSupply(endpoint: string, denom: string) {
  try {
    const url = `${endpoint}/cosmos/bank/v1beta1/supply/by_denom?denom=${encodeURIComponent(
      denom
    )}`;
    const res = await fetch(url);
    if (!res.ok) return "0";
    const j = await res.json();
    return j.amount?.amount ?? "0";
  } catch {
    return "0";
  }
}

export async function loadRows(
  getPrice: (symbol: string) => Promise<number>
): Promise<Row[]> {
  /* 1) Get all assets (static + approved) */
  const assets = await getAssets();

  /* 2) ERC-20 + IBC assets on XRPL EVM */
  const erc = await Promise.all(
    assets.map(async (a) => {
      const raw = a.address ? await peersystSupply(a.address) : "0";
      const usd = await getPrice(a.symbol);
      const q = Number(raw) / 10 ** a.decimals;
      // Per-asset supply detail can be overwhelming in normal operation; gate
      // the debug output behind an explicit VITE_DEBUG flag.
      const debug = import.meta.env?.VITE_DEBUG === 'true';
      if ((a.symbol === "WETH" || a.symbol === "WBTC" || a.symbol === "ATOM") && debug) {
        // eslint-disable-next-line no-console
        console.log(
          `[DEBUG] ${a.symbol} raw:`,
          raw,
          "decimals:",
          a.decimals,
          "quantity:",
          q,
          "usd:",
          usd,
          "valueUsd:",
          q * usd
        );
      }
      return {
        ...a,
        logo: `/assets/tokens/${a.image}`,
        chainLogo: "/chains/xrpl-evm.svg",
        quantity: q,
        priceUsd: usd,
        valueUsd: q * usd,
      } as Row;
    })
  );

  /* 2) XRP sitting on Cosmos chains – treat as extra rows */
  const xrpUsd = await getPrice("XRP");
  const xrpRows = await Promise.all(
    CHAINS.map(async (c) => {
      const raw = await cosmosSupply(c.endpoint, c.denom);
      const q = Number(raw) / 10 ** 18;
      return {
        key: `xrp-${c.key}`,
        symbol: "XRP",
        decimals: 18,
        source: "XRPL",
        dest: c.name as Destination,
        denom: c.denom,
        cg: "ripple",
        // cmc: 'ripple', // removed
        binance: "XRPUSDT",
        logo: "/assets/tokens/xrp.png",
        chainLogo: c.logo,
        quantity: q,
        priceUsd: xrpUsd,
        valueUsd: q * xrpUsd,
      } as Row;
    })
  );

  return [...erc, ...xrpRows];
}
