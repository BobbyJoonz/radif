-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'operator');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('instagram', 'file', 'replay');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('not_configured', 'ready', 'connected', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "IdentityKind" AS ENUM ('instagram_username', 'instagram_user_id', 'phone', 'gift_recipient_phone');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'archived');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('file', 'replay', 'instagram', 'manual');

-- CreateEnum
CREATE TYPE "IngestState" AS ENUM ('stored', 'duplicate', 'rejected');

-- CreateEnum
CREATE TYPE "AnalysisState" AS ENUM ('pending', 'running', 'done', 'failed', 'needs_human');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'needs_review', 'confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unknown', 'claimed', 'verified', 'disputed', 'refunded');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('not_ready', 'preparing', 'shipped', 'delivered', 'paused');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('running', 'succeeded', 'failed', 'invalid_output');

-- CreateEnum
CREATE TYPE "ReviewState" AS ENUM ('proposed', 'accepted', 'corrected', 'rejected');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('payment_reconcile', 'address_complete', 'tracking_followup', 'draft_review', 'customer_reply', 'human_review', 'shipment_action', 'refund_review');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'waiting_customer', 'done');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "TaskDedupeState" AS ENUM ('active', 'released');

-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('draft', 'queued', 'sending', 'sent', 'failed', 'delivery_unknown');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('analyze_message', 'build_draft', 'recompute_conversation', 'send_outbound');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'dead');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('system', 'user', 'demo');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran',
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSettings" (
    "tenantId" TEXT NOT NULL,
    "workdayStartMin" INTEGER NOT NULL DEFAULT 540,
    "workdayEndMin" INTEGER NOT NULL DEFAULT 1260,
    "slaFirstReplyMin" INTEGER NOT NULL DEFAULT 120,
    "slaShipMin" INTEGER NOT NULL DEFAULT 2880,
    "priceFreshnessMin" INTEGER NOT NULL DEFAULT 1440,
    "postingPaused" BOOLEAN NOT NULL DEFAULT false,
    "demoMode" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'operator',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'instagram',
    "accountRef" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'not_configured',
    "sealedToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "configUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" "IdentityKind" NOT NULL DEFAULT 'instagram_username',
    "externalRef" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channelRef" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "lastMessageAt" TIMESTAMP(3),
    "unrepliedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "source" "MessageSource" NOT NULL,
    "externalRef" TEXT NOT NULL,
    "senderRef" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "ingestState" "IngestState" NOT NULL DEFAULT 'stored',
    "analysisState" "AnalysisState" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "titleFa" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "stockQty" INTEGER,
    "infoConfirmedAt" TIMESTAMP(3) NOT NULL,
    "infoValidUntil" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "publicRef" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "totalMinor" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "orderCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "titleSnapshot" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentClaim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'claimed',
    "amountMinor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceMessageId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "disputeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'not_ready',
    "carrier" TEXT,
    "trackingCode" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "pausedReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'running',
    "typedOutput" JSONB,
    "probabilities" JSONB,
    "errorCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "latencyMs" INTEGER,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "costMicroUsd" BIGINT,
    "rateAt" TIMESTAMP(3),
    "inputRatePerMTok" DECIMAL(12,6),
    "outputRatePerMTok" DECIMAL(12,6),

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "orderId" TEXT,
    "customerId" TEXT,
    "field" TEXT NOT NULL,
    "proposedValue" JSONB NOT NULL,
    "candidateId" TEXT,
    "evidenceStart" INTEGER,
    "evidenceEnd" INTEGER,
    "reviewState" "ReviewState" NOT NULL DEFAULT 'proposed',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "correctedValue" JSONB,
    "confidence" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "priority" "Priority" NOT NULL DEFAULT 'P2',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "orderId" TEXT,
    "messageId" TEXT,
    "customerId" TEXT,
    "assigneeId" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "dedupeKey" TEXT,
    "dedupeState" "TaskDedupeState" NOT NULL DEFAULT 'active',
    "closedAt" TIMESTAMP(3),
    "closeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT,
    "conversationId" TEXT,
    "templateKey" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "OutboundStatus" NOT NULL DEFAULT 'draft',
    "providerRef" TEXT,
    "idempotencyKey" TEXT,
    "queuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "dedupeKey" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL DEFAULT 'system',
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "ChannelConnection_tenantId_idx" ON "ChannelConnection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_tenantId_channel_accountRef_key" ON "ChannelConnection"("tenantId", "channel", "accountRef");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_phone_idx" ON "Customer"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_id_tenantId_key" ON "Customer"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CustomerIdentity_tenantId_idx" ON "CustomerIdentity"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerIdentity_customerId_idx" ON "CustomerIdentity"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerIdentity_id_tenantId_key" ON "CustomerIdentity"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerIdentity_connectionId_kind_externalRef_key" ON "CustomerIdentity"("connectionId", "kind", "externalRef");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_lastMessageAt_idx" ON "Conversation"("tenantId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_customerId_idx" ON "Conversation"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_id_tenantId_key" ON "Conversation"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_connectionId_channelRef_key" ON "Conversation"("connectionId", "channelRef");

-- CreateIndex
CREATE INDEX "Message_tenantId_occurredAt_idx" ON "Message"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_occurredAt_idx" ON "Message"("conversationId", "occurredAt");

-- CreateIndex
CREATE INDEX "Message_tenantId_analysisState_idx" ON "Message"("tenantId", "analysisState");

-- CreateIndex
CREATE UNIQUE INDEX "Message_id_tenantId_key" ON "Message"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_tenantId_source_externalRef_key" ON "Message"("tenantId", "source", "externalRef");

-- CreateIndex
CREATE INDEX "Product_tenantId_active_idx" ON "Product"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_idx" ON "Order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Order_tenantId_customerId_idx" ON "Order"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_tenantId_key" ON "Order"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_publicRef_key" ON "Order"("tenantId", "publicRef");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_tenantId_idx" ON "OrderItem"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentClaim_tenantId_status_idx" ON "PaymentClaim"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PaymentClaim_orderId_idx" ON "PaymentClaim"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_tenantId_status_idx" ON "Shipment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "AnalysisRun_tenantId_queuedAt_idx" ON "AnalysisRun"("tenantId", "queuedAt");

-- CreateIndex
CREATE INDEX "AnalysisRun_messageId_idx" ON "AnalysisRun"("messageId");

-- CreateIndex
CREATE INDEX "AnalysisRun_tenantId_contextHash_idx" ON "AnalysisRun"("tenantId", "contextHash");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisRun_id_tenantId_key" ON "AnalysisRun"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Suggestion_tenantId_reviewState_idx" ON "Suggestion"("tenantId", "reviewState");

-- CreateIndex
CREATE INDEX "Suggestion_sourceMessageId_idx" ON "Suggestion"("sourceMessageId");

-- CreateIndex
CREATE INDEX "Suggestion_analysisRunId_idx" ON "Suggestion"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_id_tenantId_key" ON "Suggestion"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Task_tenantId_status_dueAt_idx" ON "Task"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_tenantId_priority_idx" ON "Task"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "Task_orderId_idx" ON "Task"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_id_tenantId_key" ON "Task"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_tenantId_dedupeKey_key" ON "Task"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "OutboundMessage_tenantId_status_idx" ON "OutboundMessage"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OutboundMessage_orderId_idx" ON "OutboundMessage"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_tenantId_idempotencyKey_key" ON "OutboundMessage"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_tenantId_type_status_idx" ON "Job"("tenantId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Job_tenantId_dedupeKey_key" ON "Job"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_entityType_entityId_idx" ON "AuditEvent"("tenantId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerIdentity" ADD CONSTRAINT "CustomerIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerIdentity" ADD CONSTRAINT "CustomerIdentity_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentClaim" ADD CONSTRAINT "PaymentClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentClaim" ADD CONSTRAINT "PaymentClaim_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentClaim" ADD CONSTRAINT "PaymentClaim_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentClaim" ADD CONSTRAINT "PaymentClaim_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Hand-written tail: tenant integrity + no-fabricated-state constraints.
--
-- Prisma cannot express "this child row and that parent row must belong to the
-- same tenant", so it is enforced here, in the database, not only in the
-- service layer. Every composite key below is DEFERRABLE INITIALLY DEFERRED so
-- a cascading delete cannot trip a check mid-statement.
--
-- This is what stops `POST /orders` with a customer id from another shop, and
-- what makes the "two tenants" seed meaningful under test.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "Conversation"    ADD CONSTRAINT "Conversation_customer_tenant_fk"
  FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "CustomerIdentity" ADD CONSTRAINT "CustomerIdentity_customer_tenant_fk"
  FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Message"         ADD CONSTRAINT "Message_conversation_tenant_fk"
  FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Order"           ADD CONSTRAINT "Order_customer_tenant_fk"
  FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "OrderItem"       ADD CONSTRAINT "OrderItem_order_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PaymentClaim"    ADD CONSTRAINT "PaymentClaim_order_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Shipment"        ADD CONSTRAINT "Shipment_order_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_order_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "AuditEvent"      ADD CONSTRAINT "AuditEvent_order_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Suggestion"      ADD CONSTRAINT "Suggestion_order_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Suggestion"      ADD CONSTRAINT "Suggestion_message_tenant_fk"
  FOREIGN KEY ("sourceMessageId", "tenantId") REFERENCES "Message"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Suggestion"      ADD CONSTRAINT "Suggestion_analysis_tenant_fk"
  FOREIGN KEY ("analysisRunId", "tenantId") REFERENCES "AnalysisRun"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Task"            ADD CONSTRAINT "Task_order_tenant_fk"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Task"            ADD CONSTRAINT "Task_message_tenant_fk"
  FOREIGN KEY ("messageId", "tenantId") REFERENCES "Message"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Task"            ADD CONSTRAINT "Task_customer_tenant_fk"
  FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") DEFERRABLE INITIALLY DEFERRED;

-- A payment is verified only when a human did it, and there is a time.
ALTER TABLE "PaymentClaim" ADD CONSTRAINT "PaymentClaim_verified_has_verifier"
  CHECK ("status" <> 'verified' OR ("verifiedAt" IS NOT NULL AND "verifiedById" IS NOT NULL));
-- A delivered shipment has a delivery time; a shipped one has a ship time.
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_shipped_has_time"
  CHECK ("status" NOT IN ('shipped', 'delivered') OR "shippedAt" IS NOT NULL);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_delivered_has_time"
  CHECK ("status" <> 'delivered' OR "deliveredAt" IS NOT NULL);
-- Money is never negative, and never an item with zero quantity.
ALTER TABLE "Order"     ADD CONSTRAINT "Order_total_non_negative"       CHECK ("totalMinor" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_qty_positive"         CHECK ("qty" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_price_non_negative"   CHECK ("unitPriceMinor" >= 0);
-- Evidence is a span: both ends or neither, and end after start.
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_evidence_pair"
  CHECK (("evidenceStart" IS NULL) = ("evidenceEnd" IS NULL));
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_evidence_non_empty"
  CHECK ("evidenceStart" IS NULL OR ("evidenceEnd" > "evidenceStart" AND "evidenceStart" >= 0));
-- A closed task records when it closed; an empty message is not a message.
ALTER TABLE "Task"    ADD CONSTRAINT "Task_done_has_closed_at" CHECK ("status" <> 'done' OR "closedAt" IS NOT NULL);
ALTER TABLE "Message" ADD CONSTRAINT "Message_text_not_blank"  CHECK (length(btrim("text")) > 0);
-- Working hours must describe a working day.
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_workday"
  CHECK ("workdayStartMin" >= 0 AND "workdayEndMin" <= 1440 AND "workdayStartMin" < "workdayEndMin");
