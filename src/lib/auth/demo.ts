import type { Session } from "../types";

/** The single built-in session used when AUTH_MODE=demo (public demo office, no sign-in). */
export const DEMO_SESSION: Session = { userId: "user_demo", officeId: "office_demo", role: "owner", name: "Demo Advocate", mode: "demo" };
