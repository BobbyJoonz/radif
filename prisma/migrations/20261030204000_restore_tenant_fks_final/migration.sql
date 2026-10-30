-- Repair (root cause, see docs/GATES.md): `prisma migrate dev` diffs the database
-- against schema.prisma, and the fifteen composite tenant keys are hand-written SQL
-- that the schema does not declare — so every generated migration drops them. This
-- migration runs after platform_admin and re-asserts them; the regression test
-- tests/tenant-isolation.test.ts fails the moment one is missing, which is how this
-- was caught. The durable fix is to declare the keys in schema.prisma; until then a
-- new migration must be followed by this repair.

ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_customerId_tenant_fk";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_tenant_fk"
  FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "CustomerIdentity" DROP CONSTRAINT IF EXISTS "CustomerIdentity_customerId_tenant_fk";
ALTER TABLE "CustomerIdentity" ADD CONSTRAINT "CustomerIdentity_customerId_tenant_fk"
  FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_conversationId_tenant_fk";
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_tenant_fk"
  FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_customerId_tenant_fk";
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_tenant_fk"
  FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_orderId_tenant_fk";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "PaymentClaim" DROP CONSTRAINT IF EXISTS "PaymentClaim_orderId_tenant_fk";
ALTER TABLE "PaymentClaim" ADD CONSTRAINT "PaymentClaim_orderId_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Shipment" DROP CONSTRAINT IF EXISTS "Shipment_orderId_tenant_fk";
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "OutboundMessage" DROP CONSTRAINT IF EXISTS "OutboundMessage_orderId_tenant_fk";
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_orderId_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "AuditEvent" DROP CONSTRAINT IF EXISTS "AuditEvent_orderId_tenant_fk";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_orderId_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Suggestion" DROP CONSTRAINT IF EXISTS "Suggestion_orderId_tenant_fk";
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_orderId_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Suggestion" DROP CONSTRAINT IF EXISTS "Suggestion_sourceMessageId_tenant_fk";
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_sourceMessageId_tenant_fk"
  FOREIGN KEY ("sourceMessageId", "tenantId") REFERENCES "Message"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Suggestion" DROP CONSTRAINT IF EXISTS "Suggestion_analysisRunId_tenant_fk";
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_analysisRunId_tenant_fk"
  FOREIGN KEY ("analysisRunId", "tenantId") REFERENCES "AnalysisRun"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_orderId_tenant_fk";
ALTER TABLE "Task" ADD CONSTRAINT "Task_orderId_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_messageId_tenant_fk";
ALTER TABLE "Task" ADD CONSTRAINT "Task_messageId_tenant_fk"
  FOREIGN KEY ("messageId", "tenantId") REFERENCES "Message"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_customerId_tenant_fk";
ALTER TABLE "Task" ADD CONSTRAINT "Task_customerId_tenant_fk"
  FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
