const isDev = process.env.NODE_ENV === 'development';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const log = (...args: any[]) => { if (isDev) console.log(...args); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const logError = (...args: any[]) => { if (isDev) console.error(...args); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const logWarn = (...args: any[]) => { if (isDev) console.warn(...args); };
