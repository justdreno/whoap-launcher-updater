-- Create update_announcements table for launcher updates
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS update_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT NOT NULL UNIQUE,  -- Version must be unique (only 1 update at a time)
    download_url TEXT NOT NULL,
    button_title TEXT NOT NULL DEFAULT 'Update Now',
    message TEXT,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE update_announcements ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active updates
CREATE POLICY "Allow public read access to active updates"
    ON update_announcements FOR SELECT
    TO authenticated, anon
    USING (is_active = true);

-- Policy: Only admins/devs can manage updates
CREATE POLICY "Allow admins to manage updates"
    ON update_announcements FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'developer')
        )
    );

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE update_announcements;

-- Insert a sample update (optional)
-- INSERT INTO update_announcements (version, download_url, button_title, message, priority)
-- VALUES ('2.4.0', 'https://github.com/justdreno/Whoap-Launcer/releases', 'Download v2.4.0', 'New features and bug fixes!', 'normal');
