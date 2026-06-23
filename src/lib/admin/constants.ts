/** Obscure admin URL segment — not linked from the site. */
export { ADMIN_PANEL_PATH } from "./panel-path";

export const ADMIN_SESSION_COOKIE = "qhub_admin_session";

export const DEFAULT_ADMIN_EMAIL = "doping@mail.ru";
export const DEFAULT_ADMIN_PASSWORD = "@Lina2019";

export const REDIS_PASSWORD_HASH_KEY = "qhub:admin:password_hash";
export const REDIS_HIDDEN_APPS_KEY = "qhub:admin:hidden_apps";

export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days
