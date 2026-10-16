export function metadata(raw?: any): any;
export function latestTurn(meta: any): [string, any] | undefined;
export function snapshot(session: any): any;
export function applyCandidates(type: string, raw: any, proposal: any, source: any): {raw: any; changed: string[]; results: any[]};
export function extractExplicit(message: string, state: any): any;
export function isCorrection(message: string): boolean;
export function planResponse(state: any, changed?: string[], message?: string, options?: any): string;

export function stableStringify(value: any): string;
export function documentSummary(state: any): string;

export function effectiveResults(results?: any[]): any[];
