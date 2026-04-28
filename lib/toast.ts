export type ToastType = 'success' | 'error' | 'info';

export function toast(message: string, type: ToastType = 'error') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('sea-toast', { detail: { message, type } }),
  );
}
