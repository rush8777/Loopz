/**
 * Safe wrapper around localStorage/sessionStorage.
 * Some browsers throw in private mode / sandboxed iframes - never let
 * storage access break the host website.
 */
class SafeStorage {
  constructor(private area: "localStorage" | "sessionStorage") {}

  private get store(): Storage | null {
    try {
      const s = window[this.area];
      const testKey = "__analytics_test__";
      s.setItem(testKey, "1");
      s.removeItem(testKey);
      return s;
    } catch {
      return null;
    }
  }

  get(key: string): string | null {
    try {
      return this.store?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      this.store?.setItem(key, value);
    } catch {
      /* ignore quota / privacy errors */
    }
  }

  remove(key: string): void {
    try {
      this.store?.removeItem(key);
    } catch {
      /* noop */
    }
  }
}

export const localStore = new SafeStorage("localStorage");
export const sessionStore = new SafeStorage("sessionStorage");
