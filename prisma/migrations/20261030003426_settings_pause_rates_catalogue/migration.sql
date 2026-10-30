-- DropForeignKey
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_order_tenant_fk";

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_customer_tenant_fk";

-- DropForeignKey
ALTER TABLE "CustomerIdentity" DROP CONSTRAINT "CustomerIdentity_customer_tenant_fk";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_conversation_tenant_fk";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_customer_tenant_fk";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_order_tenant_fk";

-- DropForeignKey
ALTER TABLE "OutboundMessage" DROP CONSTRAINT "OutboundMessage_order_tenant_fk";

-- DropForeignKey
ALTER TABLE "PaymentClaim" DROP CONSTRAINT "PaymentClaim_order_tenant_fk";

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_order_tenant_fk";

-- DropForeignKey
ALTER TABLE "Suggestion" DROP CONSTRAINT "Suggestion_analysis_tenant_fk";

-- DropForeignKey
ALTER TABLE "Suggestion" DROP CONSTRAINT "Suggestion_message_tenant_fk";

-- DropForeignKey
ALTER TABLE "Suggestion" DROP CONSTRAINT "Suggestion_order_tenant_fk";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_customer_tenant_fk";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_message_tenant_fk";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_order_tenant_fk";
