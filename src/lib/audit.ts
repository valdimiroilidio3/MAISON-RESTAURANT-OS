import "server-only";
import { run } from "./db";
import { nowIso } from "./dates";
import type { SessionUser } from "./types";

export function recordAudit(
  actor: SessionUser,
  action: string,
  entity: string,
  entityId: string | number,
  detail: string,
): void {
  run(
    "INSERT INTO audit_log (restaurant_id,actor_id,action,entity,entity_id,detail,created_at) VALUES (?,?,?,?,?,?,?)",
    actor.restaurantId,
    actor.id,
    action,
    entity,
    String(entityId),
    detail.slice(0, 500),
    nowIso(),
  );
}

export interface AuditEntry {
  id: number;
  action: string;
  entity: string;
  entityId: string;
  detail: string;
  actorName: string | null;
  actorRole: string | null;
  createdAt: string;
}
