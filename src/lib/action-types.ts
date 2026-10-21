/** Serializable shapes shared by server actions and client forms. */
export interface ActionState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  data?: Record<string, string | number | null>;
}

export const idleAction: ActionState = { ok: false, message: "" };
