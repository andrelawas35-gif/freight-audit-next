-- Migration: 0021_gateway_active_flag
-- Purpose: Add gateway_active flag for explicit enforcement readiness gating.
-- Grilling decision (2026-06-27): staff must explicitly opt-in a ruleset
-- for gateway enforcement. active ≠ gateway_active.
-- Wave 1, E2: Gateway Cache Fix.

ALTER TABLE policy_rulesets ADD COLUMN IF NOT EXISTS gateway_active BOOLEAN DEFAULT FALSE;
