import { Currency } from './entities/currency.entity';

/** Public shape of a currency returned by the API. */
export interface CurrencyProfile {
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
}

export function presentCurrency(c: Currency): CurrencyProfile {
  return {
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    decimalPlaces: c.decimalPlaces,
    isActive: c.isActive,
  };
}
