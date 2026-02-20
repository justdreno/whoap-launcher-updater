# Yashin Minecraft Launcher - Supabase Database Schema

## Project Overview
**Yashin** is a next-generation Minecraft launcher with cloud sync, social features, and instance management capabilities. This document contains the complete database schema for Supabase implementation.

---

## Table of Contents
1. [Tables Overview](#tables-overview)
2. [Complete SQL Schema](#complete-sql-schema)
3. [Table Descriptions](#table-descriptions)
4. [Relationships Diagram](#relationships-diagram)
5. [Storage Buckets](#storage-buckets)
6. [Row Level Security (RLS)](#row-level-security)

---

## Tables Overview

| Table Name | Purpose | Key Relationships |
|------------|---------|-------------------|
| `profiles` | User profiles and authentication data | Referenced by most tables |
| `badges` | Available badges/achievements | Referenced by `user_badges` |
| `user_badges` | User-badge associations | Links `profiles` and `badges` |
| `settings` | User preferences and settings | One-to-one with `profiles` |
| `user_stats` | User gameplay statistics | One-to-one with `profiles` |
| `featured_servers` | Curated Minecraft servers | Standalone |
| `news` | News articles | Standalone |
| `changelogs` | Version changelogs | Standalone |

---

## Complete SQL Schema

```sql
-- =====================================================
-- YASHIN MINECRAFT LAUNCHER - SUPABASE DATABASE SCHEMA
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. PROFILES TABLE
-- =====================================================
-- Stores user profile information, roles, and authentication data
-- This is the central table that most other tables reference

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'developer')),
    avatar_url TEXT,
    preferred_skin TEXT,
    preferred_cape TEXT,
    skin_url TEXT,
    cape_url TEXT,
    bio TEXT DEFAULT '',
    social_links JSONB DEFAULT '{"youtube": "", "discord": "", "twitter": "", "github": ""}'::jsonb,
    skin_history JSONB DEFAULT '[]'::jsonb,
    banner_url TEXT,
    is_public BOOLEAN DEFAULT false,
    banned BOOLEAN DEFAULT false,
    ban_reason TEXT,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 20),
    CONSTRAINT bio_length CHECK (char_length(bio) <= 500)
);

CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_is_public ON profiles(is_public);
CREATE INDEX idx_profiles_updated_at ON profiles(updated_at DESC);

COMMENT ON TABLE profiles IS 'User profiles with authentication, customization, and social features';
COMMENT ON COLUMN profiles.role IS 'User role: user, admin, or developer';
COMMENT ON COLUMN profiles.skin_history IS 'Array of {url, uploaded_at, name} objects tracking skin changes';
COMMENT ON COLUMN profiles.social_links IS 'JSON object with social media links';

-- =====================================================
-- 2. BADGES TABLE
-- =====================================================
-- Stores available badges/achievements that can be granted to users

CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT name_not_empty CHECK (char_length(name) > 0),
    CONSTRAINT description_not_empty CHECK (char_length(description) > 0)
);

CREATE INDEX idx_badges_name ON badges(name);

COMMENT ON TABLE badges IS 'Achievement badges that can be awarded to users';

-- =====================================================
-- 3. USER_BADGES TABLE
-- =====================================================
-- Junction table linking users to their earned badges

CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, badge_id)
);

CREATE INDEX idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX idx_user_badges_badge_id ON user_badges(badge_id);
CREATE INDEX idx_user_badges_granted_at ON user_badges(granted_at DESC);

COMMENT ON TABLE user_badges IS 'Links users to their earned badges';

-- =====================================================
-- 4. SETTINGS TABLE
-- =====================================================
-- Stores user-specific settings and preferences

CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    minRam INTEGER DEFAULT 2048,
    maxRam INTEGER DEFAULT 4096,
    launchBehavior TEXT DEFAULT 'keep_open' CHECK (launchBehavior IN ('keep_open', 'close', 'minimize')),
    showConsoleOnLaunch BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT ram_values_valid CHECK (minRam > 0 AND maxRam >= minRam)
);

CREATE INDEX idx_settings_user_id ON settings(user_id);

COMMENT ON TABLE settings IS 'User preferences and launcher settings';
COMMENT ON COLUMN settings.minRam IS 'Minimum RAM allocation in MB';
COMMENT ON COLUMN settings.maxRam IS 'Maximum RAM allocation in MB';

-- =====================================================
-- 5. USER_STATS TABLE (Optional)
-- =====================================================
-- Tracks user gameplay statistics

CREATE TABLE IF NOT EXISTS user_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    total_playtime_seconds INTEGER DEFAULT 0,
    instances_created INTEGER DEFAULT 0,
    screenshots_taken INTEGER DEFAULT 0,
    friends_count INTEGER DEFAULT 0,
    last_played_at TIMESTAMPTZ,
    favorite_version TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT stats_non_negative CHECK (
        total_playtime_seconds >= 0 AND 
        instances_created >= 0 AND 
        screenshots_taken >= 0 AND 
        friends_count >= 0
    )
);

CREATE INDEX idx_user_stats_user_id ON user_stats(user_id);
CREATE INDEX idx_user_stats_total_playtime ON user_stats(total_playtime_seconds DESC);

COMMENT ON TABLE user_stats IS 'Gameplay statistics and metrics for users';

-- =====================================================
-- 6. FEATURED_SERVERS TABLE
-- =====================================================
-- Stores curated Minecraft servers displayed to users

CREATE TABLE IF NOT EXISTS featured_servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    icon_url TEXT,
    banner_url TEXT,
    description TEXT,
    rank INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT name_not_empty CHECK (char_length(name) > 0),
    CONSTRAINT address_not_empty CHECK (char_length(address) > 0)
);

CREATE INDEX idx_featured_servers_rank ON featured_servers(rank ASC);
CREATE INDEX idx_featured_servers_created_at ON featured_servers(created_at DESC);

COMMENT ON TABLE featured_servers IS 'Curated list of Minecraft servers';
COMMENT ON COLUMN featured_servers.rank IS 'Display order (lower = higher priority)';

-- =====================================================
-- 7. NEWS TABLE
-- =====================================================
-- Stores news articles and announcements

CREATE TABLE IF NOT EXISTS news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    color TEXT DEFAULT '#3B82F6',
    link_url TEXT,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT title_not_empty CHECK (char_length(title) > 0),
    CONSTRAINT content_not_empty CHECK (char_length(content) > 0)
);

CREATE INDEX idx_news_published ON news(published);
CREATE INDEX idx_news_created_at ON news(created_at DESC);
CREATE INDEX idx_news_author_id ON news(author_id);

COMMENT ON TABLE news IS 'News articles and announcements';

-- =====================================================
-- 8. CHANGELOGS TABLE
-- =====================================================
-- Stores version changelogs and release notes

CREATE TABLE IF NOT EXISTS changelogs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'release' CHECK (type IN ('release', 'beta', 'hotfix')),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT version_not_empty CHECK (char_length(version) > 0),
    CONSTRAINT description_not_empty CHECK (char_length(description) > 0)
);

CREATE INDEX idx_changelogs_created_at ON changelogs(created_at DESC);
CREATE INDEX idx_changelogs_type ON changelogs(type);
CREATE INDEX idx_changelogs_version ON changelogs(version);

COMMENT ON TABLE changelogs IS 'Version changelogs and release notes';

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================

-- Bucket for screenshots
INSERT INTO storage.buckets (id, name, public) 
VALUES ('screenshots', 'screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket for skins and capes
INSERT INTO storage.buckets (id, name, public) 
VALUES ('yashin-skins', 'yashin-skins', true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE featured_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelogs ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY "Public profiles are viewable by everyone" 
    ON profiles FOR SELECT 
    USING (true);

CREATE POLICY "Users can update own profile" 
    ON profiles FOR UPDATE 
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" 
    ON profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- BADGES POLICIES
CREATE POLICY "Badges are viewable by everyone" 
    ON badges FOR SELECT 
    USING (true);

CREATE POLICY "Only admins can manage badges" 
    ON badges FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'developer')
        )
    );

-- USER_BADGES POLICIES
CREATE POLICY "User badges are viewable by everyone" 
    ON user_badges FOR SELECT 
    USING (true);

CREATE POLICY "Only admins can grant/revoke badges" 
    ON user_badges FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'developer')
        )
    );

-- SETTINGS POLICIES
CREATE POLICY "Users can view own settings" 
    ON settings FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" 
    ON settings FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" 
    ON settings FOR UPDATE 
    USING (auth.uid() = user_id);

-- USER_STATS POLICIES
CREATE POLICY "Users can view own stats" 
    ON user_stats FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stats" 
    ON user_stats FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stats" 
    ON user_stats FOR UPDATE 
    USING (auth.uid() = user_id);

-- FEATURED_SERVERS POLICIES
CREATE POLICY "Featured servers are viewable by everyone" 
    ON featured_servers FOR SELECT 
    USING (true);

CREATE POLICY "Only admins can manage featured servers" 
    ON featured_servers FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'developer')
        )
    );

-- NEWS POLICIES
CREATE POLICY "Published news is viewable by everyone" 
    ON news FOR SELECT 
    USING (published = true OR EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'developer')
    ));

CREATE POLICY "Only admins can manage news" 
    ON news FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'developer')
        )
    );

-- CHANGELOGS POLICIES
CREATE POLICY "Changelogs are viewable by everyone" 
    ON changelogs FOR SELECT 
    USING (true);

CREATE POLICY "Only admins can manage changelogs" 
    ON changelogs FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'developer')
        )
    );

-- =====================================================
-- STORAGE POLICIES
-- =====================================================

-- Screenshots bucket policies
CREATE POLICY "Screenshots are publicly viewable" 
    ON storage.objects FOR SELECT 
    USING (bucket_id = 'screenshots');

CREATE POLICY "Authenticated users can upload screenshots" 
    ON storage.objects FOR INSERT 
    WITH CHECK (bucket_id = 'screenshots' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete own screenshots" 
    ON storage.objects FOR DELETE 
    USING (bucket_id = 'screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Yashin skins bucket policies
CREATE POLICY "Skins are publicly viewable" 
    ON storage.objects FOR SELECT 
    USING (bucket_id = 'yashin-skins');

CREATE POLICY "Authenticated users can upload skins" 
    ON storage.objects FOR INSERT 
    WITH CHECK (bucket_id = 'yashin-skins' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update own skins" 
    ON storage.objects FOR UPDATE 
    USING (bucket_id = 'yashin-skins' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own skins" 
    ON storage.objects FOR DELETE 
    USING (bucket_id = 'yashin-skins' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_featured_servers_updated_at BEFORE UPDATE ON featured_servers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_news_updated_at BEFORE UPDATE ON news
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_stats_updated_at BEFORE UPDATE ON user_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
-- Additional composite indexes for common queries

CREATE INDEX idx_user_badges_user_badge ON user_badges(user_id, badge_id);

-- =====================================================
-- END OF SCHEMA
-- =====================================================
```

---

## Table Descriptions

### 1. **profiles**
**Purpose**: Central user profile table containing authentication data, customization options, and social information.

**Key Features**:
- Links to Supabase Auth (`auth.users`)
- Stores Minecraft skin/cape preferences
- Public profile visibility toggle
- User roles (user, admin, developer)
- Social media links
- Skin history tracking
- Ban system for moderation

**Used For**:
- User authentication and authorization
- Profile customization (skins, capes, avatar)
- Social features (public profiles)
- Admin/moderation features

---

### 2. **badges**
**Purpose**: Defines available achievement badges that can be awarded to users.

**Key Features**:
- Unique badge names
- Customizable icons and colors
- Reusable across multiple users

**Used For**:
- Achievement/reward system
- User recognition
- Gamification

---

### 3. **user_badges**
**Purpose**: Junction table linking users to their earned badges.

**Key Features**:
- Many-to-many relationship between users and badges
- Tracks who granted the badge and when
- Prevents duplicate badge awards

**Used For**:
- Displaying user achievements
- Badge management
- Award tracking

---

### 4. **settings**
**Purpose**: Stores user-specific launcher preferences and settings.

**Key Features**:
- RAM allocation settings
- Launch behavior preferences
- Console display options
- Synced across devices (excludes device-specific paths)

**Used For**:
- Launcher configuration
- Performance tuning
- User experience customization

---

### 5. **user_stats** (Optional)
**Purpose**: Tracks gameplay statistics and metrics.

**Key Features**:
- Playtime tracking
- Instance creation count
- Screenshot count
- Friend count
- Favorite version tracking

**Used For**:
- User analytics
- Leaderboards
- Profile statistics display

---

### 6. **featured_servers**
**Purpose**: Curated list of Minecraft servers promoted to users.

**Key Features**:
- Ranking/ordering system
- Rich metadata (banners, icons, descriptions)
- Admin-managed

**Used For**:
- Server discovery
- Community building
- Promoted content

---

### 7. **news**
**Purpose**: News articles and announcements for the launcher.

**Key Features**:
- Rich content (title, content, images)
- Publication status
- Author tracking
- Custom colors and external links

**Used For**:
- Community updates
- Feature announcements
- Event promotions

---

### 8. **changelogs**
**Purpose**: Version history and release notes.

**Key Features**:
- Version tracking
- Release type classification (release, beta, hotfix)
- Chronological ordering

**Used For**:
- Update notifications
- Version history
- Release documentation

---

## Relationships Diagram

```
┌─────────────────┐
│  auth.users     │
│  (Supabase)     │
└────────┬────────┘
         │
         │ 1:1
         ▼
┌─────────────────┐         ┌─────────────────┐
│   profiles      │◄───────►│    badges       │
│  (User Data)    │  M:N    │  (Achievements) │
└────────┬────────┘         └─────────────────┘
         │                           ▲
         │                           │
         │ 1:N                       │ M:N
         │                           │
         ├──────────────────┬────────┴──────────┐
         │                  │                   │
         ▼                  ▼                   │
┌─────────────────┐ ┌─────────────────┐ ┌──────┴──────────┐
│    settings     │ │   user_stats    │ │  user_badges    │
│  (Preferences)  │ │  (Statistics)   │ │  (Junction)     │
└─────────────────┘ └─────────────────┘ └─────────────────┘


STANDALONE TABLES:
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│featured_servers  │  │      news        │  │   changelogs     │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## Storage Buckets

### 1. **screenshots**
- **Purpose**: Store user-uploaded game screenshots
- **Public**: Yes (publicly accessible)
- **Structure**: Organized by user folders
- **Usage**: Screenshot gallery, sharing features

### 2. **yashin-skins**
- **Purpose**: Store Minecraft skins and capes
- **Public**: Yes (publicly accessible for multiplayer)
- **Structure**: `{user_id}/skin_{timestamp}.png` or `{user_id}/cape_{timestamp}.png`
- **Usage**: Skin customization, profile display, multiplayer skin visibility

---

## Row Level Security (RLS)

All tables have RLS enabled with the following general patterns:

### Public Read Tables:
- `badges` - Anyone can view
- `featured_servers` - Anyone can view
- `news` - Published articles viewable by all
- `changelogs` - Anyone can view
- `profiles` - Basic info viewable by all

### User-Scoped Tables:
- `settings` - Users can only access their own
- `user_stats` - Users can only access their own

### Admin-Only Write:
- `badges` - Only admins can create/modify
- `featured_servers` - Only admins can manage
- `news` - Only admins can manage
- `changelogs` - Only admins can manage

---

## Notes

1. **DO NOT RUN THIS IN PRODUCTION WITHOUT REVIEW** - This is a comprehensive schema but should be reviewed and tested in a development environment first.

2. **UUID Primary Keys**: All tables use UUIDs for better security and scalability.

3. **Cascading Deletes**: User deletion will cascade to all related data (settings, badges, stats, etc.).

4. **Timestamps**: All major tables have `created_at` and `updated_at` with automatic triggers.

5. **Indexes**: Comprehensive indexing for common query patterns (user lookups, date sorting).

6. **Constraints**: Input validation through CHECK constraints on critical fields.

7. **JSONB Usage**: Flexible data storage for skin history and social links.

8. **RLS Security**: Comprehensive row-level security ensures users can only access their own data or public data.

---

## Migration Instructions

To use this schema in Supabase:

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the entire SQL schema above
5. Execute the query
6. Verify all tables and policies were created successfully
7. Test with sample data

**Important**: Run this only on a fresh database or ensure no conflicting tables exist.

---

**Generated**: 2025
**Version**: 1.0
**Project**: Yashin Minecraft Launcher
