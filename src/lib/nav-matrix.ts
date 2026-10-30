/**
 * Which sections each principal sees (audit RBAC_MATRIX.csv / MENU_MATRIX.csv).
 *
 * Platform administration is a different principal and is not part of this MVP, so
 * it is deliberately absent — the app must not show a menu item that leads nowhere.
 * The customer reaches one order by link, not a shop menu.
 *
 * Hiding is navigation, never authorisation: every route still checks the session and
 * the role on the server.
 */
export type ShopRole = "owner" | "operator";
export type NavKey = "today" | "inbox" | "orders" | "tasks" | "customers" | "import" | "settings" | "evaluation";

const OWNER: NavKey[] = ["today", "inbox", "orders", "tasks", "customers", "import", "settings", "evaluation"];
const OPERATOR: NavKey[] = ["today", "inbox", "orders", "tasks", "customers"];

export function navKeysFor(role: ShopRole): NavKey[] {
  return role === "owner" ? [...OWNER] : [...OPERATOR];
}

export function canSee(role: ShopRole, key: NavKey): boolean {
  return navKeysFor(role).includes(key);
}

/**
 * The account menu is navigation too. It used to hard-code settings and
 * evaluation for every role, so an operator saw two doors that 403 behind them.
 * This is the only list the menu may render.
 */
export function accountMenuKeys(role: ShopRole): NavKey[] {
  return (["settings", "evaluation"] as NavKey[]).filter((key) => canSee(role, key));
}

/** Sections whose pages an operator must not reach even by typing the URL. */
export function ownerOnlySections(): NavKey[] {
  return OWNER.filter((key) => !OPERATOR.includes(key));
}
