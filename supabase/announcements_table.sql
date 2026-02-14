-- Create announcements table for sending update notifications
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'announcement' CHECK (type IN ('update', 'announcement', 'maintenance', 'warning')),
    version TEXT,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    published BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMP WITH TIME ZONE,
    ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (authenticated users can view)
CREATE POLICY "Allow public read access to announcements"
    ON announcements FOR SELECT
    TO authenticated
    USING (published = true AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW()));

-- Create policy for admin/developer write access
CREATE POLICY "Allow admins to manage announcements"
    ON announcements FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'developer')
        )
    );

-- Enable Realtime for announcements
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;

-- Insert a sample announcement (optional)
-- INSERT INTO announcements (title, message, type, version, priority)
-- VALUES ('Welcome to Whoap!', 'Thank you for using Whoap Launcher! Stay tuned for updates.', 'announcement', NULL, 'low');
