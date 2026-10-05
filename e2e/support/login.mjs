/**
 * Sign-in for the end-to-end tests. A department head created by the Boss signs in with a
 * temporary password and must choose their own first (/change-password): this helper does that
 * step the first time and remembers the chosen password, so later sign-ins with the same
 * temporary password use it. A new temporary password (Boss reset) goes through the step again.
 */
const chosen = new Map();

export const passwordFor = (email, password) => chosen.get(`${email}|${password}`) || password;

/** Fills the forced change form when the app asks for it. Returns the password now in use. */
export async function choosePasswordIfAsked(page, email, password) {
  if (!new URL(page.url()).pathname.startsWith("/change-password")) return password;
  const own = `${password}-Own7`;
  await page.locator("#cp-current").fill(password);
  await page.locator("#cp-new").fill(own);
  await page.locator("#cp-confirm").fill(own);
  await page.getByRole("button", { name: "Save my password" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/change-password"));
  chosen.set(`${email}|${password}`, own);
  return own;
}

/**
 * Signs in. `clear` clears the cookies first; `expectFailure` stops after submitting (the caller
 * checks the refusal).
 */
export async function login(page, email, password, { clear = true, expectFailure = false } = {}) {
  if (clear) await page.context().clearCookies();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(passwordFor(email, password));
  await page.locator("form button[type=submit]").click();
  if (expectFailure) return;
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await choosePasswordIfAsked(page, email, password);
}
