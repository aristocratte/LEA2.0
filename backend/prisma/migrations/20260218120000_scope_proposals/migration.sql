-- CreateEnum
CREATE TYPE "ScopeProposalSource" AS ENUM ('WHOIS_ORG_CORRELATION');

-- CreateEnum
CREATE TYPE "ScopeProposalStatus" AS ENUM ('PENDING', 'PARTIAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScopeCandidateDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "findings"
  ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "scope_proposals" (
    "id" TEXT NOT NULL,
    "pentest_id" TEXT NOT NULL,
    "base_target" TEXT NOT NULL,
    "source" "ScopeProposalSource" NOT NULL DEFAULT 'WHOIS_ORG_CORRELATION',
    "status" "ScopeProposalStatus" NOT NULL DEFAULT 'PENDING',
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "scope_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_proposal_candidates" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "recommendation_reason" TEXT,
    "evidence" JSONB,
    "decision" "ScopeCandidateDecision" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scope_proposal_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scope_proposals_pentest_id_idx" ON "scope_proposals"("pentest_id");

-- CreateIndex
CREATE INDEX "scope_proposals_status_idx" ON "scope_proposals"("status");

-- CreateIndex
CREATE INDEX "scope_proposals_created_at_idx" ON "scope_proposals"("created_at");

-- CreateIndex
CREATE INDEX "scope_proposal_candidates_proposal_id_idx" ON "scope_proposal_candidates"("proposal_id");

-- CreateIndex
CREATE INDEX "scope_proposal_candidates_decision_idx" ON "scope_proposal_candidates"("decision");

-- CreateIndex
CREATE INDEX "scope_proposal_candidates_recommended_idx" ON "scope_proposal_candidates"("recommended");

-- CreateIndex
CREATE INDEX "scope_proposal_candidates_confidence_idx" ON "scope_proposal_candidates"("confidence");

-- CreateIndex
CREATE UNIQUE INDEX "scope_proposal_candidates_proposal_id_domain_key" ON "scope_proposal_candidates"("proposal_id", "domain");

-- AddForeignKey
ALTER TABLE "scope_proposals" ADD CONSTRAINT "scope_proposals_pentest_id_fkey"
  FOREIGN KEY ("pentest_id") REFERENCES "pentests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_proposal_candidates" ADD CONSTRAINT "scope_proposal_candidates_proposal_id_fkey"
  FOREIGN KEY ("proposal_id") REFERENCES "scope_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
