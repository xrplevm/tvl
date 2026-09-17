// Env-configurable base URL for the token backend. In production this is the
// deployed API domain; the localhost fallback only applies to local development.
const API_BASE_URL =
  (import.meta.env?.VITE_APPROVED_TOKENS_API_URL as string | undefined) ??
  'http://localhost:3001/api';

export interface ApprovedToken {
  id: string;
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  totalSupply: string;
  source: string;
  coingeckoId: string | null;
  binanceSymbol: string | null;
  image: string;
  status: string;
  approvedAt: string;
}

export interface Asset {
  key: string;
  symbol: string;
  decimals: number;
  source: string;
  dest: string;
  address: string;
  cg?: string | null;
  binance?: string | null;
  image: string;
}

export const approvedTokensService = {
  async getApprovedTokens(): Promise<ApprovedToken[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/tokens/approved`);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        console.error('Failed to fetch approved tokens:', data.error);
        return [];
      }
    } catch (error) {
      console.error('Error fetching approved tokens:', error);
      return [];
    }
  },

  // Transform approved tokens to assets format for TVL dashboard
  transformToAssets(approvedTokens: ApprovedToken[]): Asset[] {
    return approvedTokens.map(token => ({
      key: token.symbol.toLowerCase(),
      symbol: token.symbol,
      decimals: token.decimals,
      source: token.source,
      dest: "XRPL EVM",
      address: token.address,
      cg: token.coingeckoId,
      binance: token.binanceSymbol,
      image: token.image
    }));
  }
};