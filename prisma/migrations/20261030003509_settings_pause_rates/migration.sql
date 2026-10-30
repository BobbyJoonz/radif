-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "inputRatePerMTok" DECIMAL(12,6),
ADD COLUMN     "outputRatePerMTok" DECIMAL(12,6),
ADD COLUMN     "ratesReadAt" TIMESTAMP(3),
ADD COLUMN     "shippingPaused" BOOLEAN NOT NULL DEFAULT false;
