export {};

declare global {
	interface Window {
		api?: Record<string, (...args: unknown[]) => Promise<unknown>>;
	}
}
