-- Migration: Add brute-force protection to OTP verification
-- Date: 2026-09-22
-- Description: Add attempts counter to otp_codes table to prevent unlimited guessing

-- ============================================
-- Add attempts column to otp_codes table
-- ============================================

ALTER TABLE public.otp_codes
ADD COLUMN IF NOT EXISTS attempts int DEFAULT 0;

COMMENT ON COLUMN public.otp_codes.attempts IS 'Number of failed verification attempts - blocks after 5 attempts';

-- Note: When creating new OTP records, ensure attempts=0 is set explicitly
-- in the INSERT/UPSERT query (with ON CONFLICT ... DO UPDATE SET attempts=0)
-- to reset the counter for new codes.
