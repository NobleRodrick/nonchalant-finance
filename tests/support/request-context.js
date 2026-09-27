/** In-memory replacements for next/headers used by server actions under test. */
class CookieJar {
  constructor() {
    this.map = new Map();
  }
  get(name) {
    return this.map.has(name) ? { name, value: this.map.get(name) } : undefined;
  }
  set(name, value) {
    this.map.set(name, value);
  }
  delete(name) {
    this.map.delete(name);
  }
  clear() {
    this.map.clear();
  }
}

export const cookieJar = new CookieJar();
export const headerJar = new Map([["x-forwarded-for", "127.0.0.1"]]);
headerJar.get = Map.prototype.get.bind(headerJar);
