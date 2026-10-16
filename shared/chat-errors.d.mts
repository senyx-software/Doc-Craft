export function errorDetails(error: any, phase?: string): {code: string; phase: string; status: number; retryable: boolean; message: string};
export function errorMessage(code: string): string;
