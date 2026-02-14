/**
 * SUPABASE FULL CLEANUP SCRIPT
 * 
 * This script will PERMANENTLY delete data from all identified tables 
 * and clear the 'screenshots' storage bucket in your Supabase project.
 * 
 * WARNING: This action cannot be undone.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
let SUPABASE_URL = process.env.SUPABASE_URL;
let SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envPath = path.join(__dirname, '..', '.env');
if ((!SUPABASE_URL || !SERVICE_KEY) && fs.existsSync(envPath)) {
    console.log('Loading configuration from .env...');
    const envFile = fs.readFileSync(envPath, 'utf8');
    const lines = envFile.split('\n');
    for (const line of lines) {
        const parts = line.split('=');
        if (parts.length < 2) continue;
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
        if (key === 'VITE_SUPABASE_URL' && !SUPABASE_URL) SUPABASE_URL = value;
        if (key === 'SUPABASE_SERVICE_ROLE_KEY' && !SERVICE_KEY) SERVICE_KEY = value;
    }
}

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('\x1b[31mError: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\x1b[0m');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// --- Order of deletion (dependencies first) ---
const TABLES = [
    { name: 'user_badges', col: 'user_id' },
    { name: 'shared_screenshots', col: 'user_uuid' },
    { name: 'shared_instances', col: 'sender_id' },
    { name: 'notifications', col: 'user_uuid' },
    { name: 'friendships', col: 'requester_id' },
    { name: 'user_stats', col: 'user_id', optional: true },
    { name: 'instances', col: 'user_id' },
    { name: 'settings', col: 'user_id' },
    { name: 'profiles', col: 'id' },
    { name: 'badges', col: 'id' },
    { name: 'featured_servers', col: 'id' },
    { name: 'system_config', col: 'key', action: 'reset' }
];

const PRESERVE = ['news', 'changelogs'];
const BUCKETS = ['screenshots'];

async function cleanup() {
    console.log('\x1b[33mStarting Supabase full cleanup...\x1b[0m');
    console.log('Project:', SUPABASE_URL);

    // 0. Pre-Cleanup: Handle Foreign Keys that block profile deletion
    console.log('Preparing tables (nullifying author/user references)...');

    // Nullify in news/changelogs (Author references)
    for (const table of PRESERVE) {
        try {
            await supabase.from(table).update({ author_id: null }).not('author_id', 'is', null);
            await supabase.from(table).update({ user_id: null }).not('user_id', 'is', null);
        } catch (e) { }
    }

    // Nullify in system_config (Updated by reference)
    try {
        await supabase.from('system_config').update({ updated_by: null }).not('updated_by', 'is', null);
    } catch (e) { }

    // 1. Purge Tables
    for (const tableObj of TABLES) {
        const table = tableObj.name;
        process.stdout.write(`Cleaning table [${table}]... `);

        try {
            if (tableObj.action === 'reset') {
                const { error } = await supabase
                    .from(table)
                    .update({ value: { version: '1.0.0' }, updated_by: null, updated_at: new Date().toISOString() })
                    .eq('key', 'app_version');
                if (error) throw error;
                console.log('\x1b[32mRESET\x1b[0m');
            } else {
                const isUUID = tableObj.col.endsWith('_id') || tableObj.col.endsWith('_uuid') || tableObj.col === 'id';
                let query = supabase.from(table).delete();

                if (isUUID) {
                    query = query.gte(tableObj.col, '00000000-0000-0000-0000-000000000000');
                } else {
                    query = query.neq(tableObj.col, 'dummy_non_existent_value');
                }

                const { error: err1 } = await query;

                if (err1) {
                    const { error: err2 } = await supabase.from(table).delete().not(tableObj.col, 'is', null);
                    if (err2) {
                        if (tableObj.optional && err1.message.includes('not found')) {
                            console.log('\x1b[34mSKIPPED\x1b[0m');
                        } else {
                            console.log(`\x1b[31mFAILED\x1b[0m (Error: ${err1.message})`);
                        }
                    } else {
                        console.log('\x1b[32mOK\x1b[0m (fallback)');
                    }
                } else {
                    console.log('\x1b[32mOK\x1b[0m');
                }
            }
        } catch (err) {
            console.log(`\x1b[31mERROR\x1b[0m (${err.message})`);
        }
    }

    // 2. Clear Storage
    for (const bucket of BUCKETS) {
        process.stdout.write(`Emptying bucket [${bucket}]... `);
        try {
            const { data: files, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
            if (error) throw error;
            if (files && files.length > 0) {
                const paths = files.map(f => f.name);
                await supabase.storage.from(bucket).remove(paths);
                console.log(`\x1b[32mOK\x1b[0m (Removed ${files.length} items)`);
            } else {
                console.log('\x1b[32mOK\x1b[0m (Empty)');
            }
        } catch (err) {
            console.log(`\x1b[31mFAILED\x1b[0m (${err.message})`);
        }
    }

    console.log('\n\x1b[32;1mCleanup completed successfully!\x1b[0m');
}

cleanup().catch(err => {
    console.error('\n\x1b[31;1mCRITICAL ERROR:\x1b[0m', err);
    process.exit(1);
});
