import { getAssets } from "../config/assets";
import { LocalStorageCacheService } from "./cacheService";
import { getPrices as getPricesFromService } from "./priceService";

const ONE_MINUTE = 1 * 60 * 1000;

export class CoingeckoService {
  private cache: LocalStorageCacheService;
  private assetsCache: any[] | null = null;
  private assetsCacheTime = 0;
  private readonly ASSETS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.cache = new LocalStorageCacheService(
      "coingecko-price-cache",
      ONE_MINUTE
    );
  }

  private async getAssets() {
    const now = Date.now();
    
    // Use cached assets if still valid
    if (this.assetsCache && (now - this.assetsCacheTime) < this.ASSETS_CACHE_TTL) {
      return this.assetsCache;
    }
    
    // Fetch fresh assets
    this.assetsCache = await getAssets();
    this.assetsCacheTime = now;
    return this.assetsCache;
  }

  async _fetchPrice(cgIds: string[]): Promise<Record<string, number>> {
    try {
      const ids = cgIds.join(",");
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
      );
      if (res.status === 429) {
        // eslint-disable-next-line no-console
        console.warn(`[priceService] Coingecko rate limited (429)`);
        return Object.fromEntries(cgIds.map((id) => [id, NaN]));
      }

      if (!res.ok) throw new Error(`CG_${res.status}`);
      const json = await res.json();

      return cgIds.reduce((out, id) => {
        out[id] = json[id]?.usd ?? NaN;
        return out;
      }, {} as Record<string, number>);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[priceService] Coingecko batch fetch failed:`, e);
      return Object.fromEntries(cgIds.map((id) => [id, NaN]));
    }
  }

  // Batch fetch Coingecko prices for multiple ids
  private async getPrices(): Promise<Record<string, number>> {
    const assets = await this.getAssets();
    const cgIds = assets.map((a) => a.cg).filter(Boolean);
    if (!cgIds.length) return {};
    const cached = this.cache.get<Record<string, number>>();
    if (cached) {
      return cached;
    }

    const prices = await this._fetchPrice(cgIds);
    this.cache.set(prices);
    return prices;
  }

  async load(): Promise<void> {
    await this.getPrices();
  }

  async getPrice(symbol: string): Promise<number> {
    const assets = await this.getAssets();
    const asset = assets.find((a) => a.symbol === symbol);
    
    if (!asset) {
      console.warn(`[CoingeckoService] Asset not found for symbol: ${symbol}`);
      return NaN;
    }

    // Special handling for mXRP - fetch from Midas API via serverless proxy, fallback to XRP × 1.002
    if (symbol === "mXRP" || asset.cg === "midas-xrp") {
      // Verbose flow logging is opt-in; the surrounding price logic should not
      // spam the browser console in normal operation.
      const debug = import.meta.env?.VITE_DEBUG === 'true';
      if (debug) console.log(`[CoingeckoService] Fetching mXRP price`);
      try {
        // Step 1: Get XRP price (needed for both approaches)
        const priceIds = [{
          cg: "ripple",
          binance: "XRPUSDT",
        }];
        
        const pricesResult = await getPricesFromService(priceIds);
        const xrpPrice = pricesResult["ripple"] || pricesResult["XRPUSDT"];
        
        console.log(`XRP price:`, xrpPrice);
        
        if (!xrpPrice || isNaN(xrpPrice) || xrpPrice <= 0) {
          console.warn(`[CoingeckoService] Invalid XRP price, returning NaN`);
          return NaN;
        }
        
        // Step 2: Try to fetch mXRP/XRP ratio from Midas API via serverless proxy
        let ratio = null;
        try {
          // Use relative path - Vercel will route /api/* to serverless functions
          const proxyUrl = `${window.location.origin}/api/midas-proxy`;
          if (debug) console.log(`[CoingeckoService] Attempting Midas API via proxy: ${proxyUrl}`);
          
          const midasResponse = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            // Add timeout
            signal: AbortSignal.timeout(10000), // 10 second timeout
          });
          
          if (midasResponse.ok) {
            const contentType = midasResponse.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
              console.warn(`[CoingeckoService] Midas proxy returned non-JSON: ${contentType}`);
            } else {
              const midasData = await midasResponse.json();
              if (midasData.ratio && typeof midasData.ratio === 'number' && midasData.ratio > 0) {
                ratio = midasData.ratio;
                if (debug) console.log(`[CoingeckoService] ✅ Got Midas ratio: ${ratio} (${midasData.dataPoints} data points)`);
              }
            }
          } else {
            console.warn(`[CoingeckoService] Midas proxy returned error: ${midasResponse.status}`);
          }
        } catch (midasError) {
          const errorMsg = midasError instanceof Error ? midasError.message : String(midasError);
          console.warn('[CoingeckoService] Midas proxy failed, using fallback:', errorMsg);
        }
        
        // Step 3: Calculate mXRP price
        // Use Midas ratio if available, otherwise fallback to fixed 1.002 multiplier
        const finalRatio = ratio || 1.002;
        const mxrpPrice = xrpPrice * finalRatio;
        
        const source = ratio ? 'Midas API' : 'fallback (1.002)';
        if (debug) console.log(`[CoingeckoService] ✅ mXRP price: $${xrpPrice.toFixed(4)} × ${finalRatio.toFixed(6)} (${source}) = $${mxrpPrice.toFixed(4)}`);
        
        return mxrpPrice;
      } catch (e) {
        console.warn('[CoingeckoService] Failed to fetch mXRP price:', e);
        return NaN;
      }
    }

    // Standard CoinGecko handling for all other tokens
    const prices = await this.getPrices();
    if (!asset.cg) return NaN;
    return prices[asset.cg] ?? NaN;
  }
}
