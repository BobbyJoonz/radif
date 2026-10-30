-- DropForeignKey
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_orderId_tenant_fk";

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_customerId_tenant_fk";

-- DropForeignKey
ALTER TABLE "CustomerIdentity" DROP CONSTRAINT "CustomerIdentity_customerId_tenant_fk";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_conversationId_tenant_fk";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_tenant_fk";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_tenant_fk";

-- DropForeignKey
ALTER TABLE "OutboundMessage" DROP CONSTRAINT "OutboundMessage_orderId_tenant_fk";

-- DropForeignKey
ALTER TABLE "PaymentClaim" DROP CONSTRAINT "PaymentClaim_orderId_tenant_fk";

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_orderId_tenant_fk";

-- DropForeignKey
ALTER TABLE "Suggestion" DROP CONSTRAINT "Suggestion_analysisRunId_tenant_fk";

-- DropForeignKey
ALTER TABLE "Suggestion" DROP CONSTRAINT "Suggestion_orderId_tenant_fk";

-- DropForeignKey
ALTER TABLE "Suggestion" DROP CONSTRAINT "Suggestion_sourceMessageId_tenant_fk";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_customerId_tenant_fk";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_messageId_tenant_fk";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_orderId_tenant_fk";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformAdmin" BOOLEAN NOT NULL DEFAULT false;
