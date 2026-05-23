-- Create phone verification table
CREATE TABLE IF NOT EXISTS phone_verification (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number text NOT NULL,
    pin text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Add verified_audio_numbers array to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS verified_audio_numbers text[] DEFAULT '{}';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_phone_verification_phone_number ON phone_verification(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_verification_expires_at ON phone_verification(expires_at);

-- Add RLS policies
ALTER TABLE phone_verification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only access their own phone verifications" ON phone_verification;

CREATE POLICY "Users can only access their own phone verifications"
    ON phone_verification
    FOR ALL
    USING (auth.uid() = user_id);

-- Grant access to authenticated users
GRANT ALL ON phone_verification TO authenticated; 