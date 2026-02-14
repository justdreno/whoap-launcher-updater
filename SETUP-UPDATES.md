# Whoap Launcher Auto-Update System Setup Guide

This guide covers the complete setup and configuration of the auto-update system for Whoap Launcher.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Initial Setup](#initial-setup)
4. [GitHub Configuration](#github-configuration)
5. [Environment Variables](#environment-variables)
6. [Building and Publishing](#building-and-publishing)
7. [Update Configuration](#update-configuration)
8. [How It Works](#how-it-works)
9. [User Experience](#user-experience)
10. [Troubleshooting](#troubleshooting)

---

## Overview

Whoap Launcher uses **electron-updater** with **GitHub Releases** to provide automatic updates. The system:

- Checks for updates automatically on startup
- Supports manual update checks
- Downloads updates in the background
- Shows download progress
- Installs updates on app restart
- Configurable auto-check intervals
- Works on Windows, macOS, and Linux

---

## Prerequisites

Before setting up auto-updates, ensure you have:

1. **GitHub Repository**
   - A public or private GitHub repository
   - Admin access to create releases
   - GitHub token (for private repos or CI/CD)

2. **Node.js & npm**
   - Node.js 18+ installed
   - npm or yarn package manager

3. **Code Signing (Windows & macOS)**
   - Windows: Code signing certificate (optional but recommended)
   - macOS: Apple Developer ID and notarization credentials

4. **Build Tools**
   - All dependencies installed: `npm install`

---

## Initial Setup

### 1. Configure Repository Details

Edit `electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: whoap                    # Your GitHub username or org
  repo: whoap-launcher            # Your repository name
  releaseType: release            # or 'draft' for testing
  # token: ${GH_TOKEN}            # For private repos (set in env)
```

### 2. Update package.json

Ensure your `package.json` has correct version and build configuration:

```json
{
  "name": "whoap",
  "version": "2.3.7",           # This version must match your GitHub release
  "main": "dist-electron/main.js",
  "scripts": {
    "build": "tsc && vite build && tsc -p tsconfig.electron.json && electron-builder"
  }
}
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required for auto-updates
GH_TOKEN=ghp_your_github_token_here    # Only needed for private repos

# Discord Rich Presence (optional)
DISCORD_BUTTON_DOWNLOAD=https://whoap.net/download
DISCORD_BUTTON_GITHUB=https://github.com/whoap/whoap-launcher

# Other configs...
```

---

## GitHub Configuration

### Creating a GitHub Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (for private repositories)
   - `public_repo` (for public repositories)
4. Generate and copy the token
5. Add to `.env` as `GH_TOKEN=your_token_here`

### Repository Structure

Your repository should have:

```
whoap-launcher/
├── .github/
│   └── workflows/          # Optional: CI/CD workflows
├── electron/
│   ├── main.ts
│   └── managers/
│       └── AutoUpdateManager.ts
├── src/
│   └── pages/
│       └── Settings.tsx
├── electron-builder.yml
├── package.json
└── .env
```

---

## Environment Variables

### Required Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GH_TOKEN` | GitHub personal access token | Only for private repos |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_BUTTON_DOWNLOAD` | URL for Discord "Download" button | `https://whoap.net` |
| `DISCORD_BUTTON_GITHUB` | URL for Discord "GitHub" button | `https://github.com/whoap` |
| `DISCORD_BUTTON_DISCORD` | Discord server invite URL | None |

### CI/CD Environment Variables

For GitHub Actions or other CI/CD:

```yaml
env:
  GH_TOKEN: ${{ secrets.GH_TOKEN }}
  EP_PRE_RELEASE: false        # Set to true for pre-releases
```

---

## Building and Publishing

### Local Build

1. **Development Build** (no publish):
   ```bash
   npm run build
   ```

2. **Production Build** (with publish):
   ```bash
   # Set environment variable first
   export GH_TOKEN=your_token_here    # Linux/Mac
   set GH_TOKEN=your_token_here       # Windows CMD
   $env:GH_TOKEN="your_token_here"    # Windows PowerShell
   
   npm run build
   ```

### Automated Publishing (GitHub Actions)

Create `.github/workflows/release.yml`:

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build and Publish
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
        run: npm run build
```

### Release Checklist

Before creating a release:

1. ✅ Update version in `package.json`
2. ✅ Update `CHANGELOG.md`
3. ✅ Test build locally: `npm run build`
4. ✅ Commit changes: `git add . && git commit -m "Release v2.3.7"`
5. ✅ Create git tag: `git tag v2.3.7`
6. ✅ Push tag: `git push origin v2.3.7`
7. ✅ Wait for CI/CD or manually run `npm run build`
8. ✅ Verify release on GitHub

---

## Update Configuration

### User Settings

Users can configure auto-updates in Settings → Software Updates:

- **Auto-check for Updates**: Enable/disable automatic checking
- **Auto-download Updates**: Automatically download when available
- **Check Interval**: 
  - Every hour
  - Every 6 hours
  - Every 12 hours
  - Every day (default)
  - Every week

### Default Behavior

```javascript
{
  autoCheck: true,          // Check on startup
  autoDownload: false,      // Manual download by default
  checkInterval: 24,        // Check every 24 hours
}
```

### Programmatic API

From the renderer process:

```typescript
// Check for updates manually
const result = await window.ipcRenderer.invoke('update:check');

// Download update
await window.ipcRenderer.invoke('update:download');

// Install update (restarts app)
await window.ipcRenderer.invoke('update:install');

// Get settings
const settings = await window.ipcRenderer.invoke('update:get-settings');

// Update settings
await window.ipcRenderer.invoke('update:set-settings', {
  autoCheck: true,
  autoDownload: false,
  checkInterval: 24
});
```

---

## How It Works

### Update Flow

1. **Startup Check** (if enabled):
   - App starts
   - Waits 5 seconds for full initialization
   - Checks GitHub releases for newer version

2. **Periodic Checks**:
   - Based on user setting (default: every 24 hours)
   - Runs in background
   - Silent if no update available

3. **Update Available**:
   - Shows notification in UI
   - User can download manually or auto-download if enabled
   - Shows download progress

4. **Download Complete**:
   - Shows "Ready to install" status
   - Option to install now or later
   - If user chooses later, installs on next quit

5. **Installation**:
   - Quits application
   - Installs update
   - Restarts with new version

### File Structure

Updates are stored in:

- **Windows**: `%LOCALAPPDATA%\whoap-updater`
- **macOS**: `~/Library/Application Support/Caches/whoap-updater`
- **Linux**: `~/.cache/whoap-updater`

### Security

- Updates are downloaded over HTTPS
- electron-updater verifies signatures
- Code signing recommended for production

---

## User Experience

### Update States

The UI shows different states:

| State | Icon | Description |
|-------|------|-------------|
| Idle | ✓ | Up to date |
| Checking | 🔄 | Checking for updates... |
| Available | ⬇️ | New version available |
| Downloading | 📊 | Download progress bar |
| Ready | ✓ | Ready to install |
| Error | ⚠️ | Update check failed |

### Notifications

- **Available**: Shows when update is found
- **Downloaded**: Shows when ready to install
- **Background**: Checks happen silently

---

## Troubleshooting

### Common Issues

#### 1. "Cannot find channel latest.yml"

**Cause**: GitHub release doesn't have the required YAML files

**Solution**:
```bash
# Ensure you're publishing correctly
export GH_TOKEN=your_token
npm run build
```

#### 2. Updates not found in development

**Cause**: electron-updater only works in packaged apps

**Solution**: 
- Build the app: `npm run build`
- Install the packaged version
- Updates will work from there

#### 3. "GitHub API rate limit exceeded"

**Cause**: Too many requests without authentication

**Solution**: 
- Set `GH_TOKEN` environment variable
- Or wait for rate limit reset

#### 4. Windows Defender blocks update

**Cause**: Unsigned executable

**Solution**: 
- Get code signing certificate
- Or users must whitelist the app

#### 5. macOS "App is damaged" error

**Cause**: App not notarized

**Solution**:
```yaml
# electron-builder.yml
mac:
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
```

### Debug Mode

Enable verbose logging:

```javascript
// In main.ts
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'debug';
```

### Checking Logs

- **Windows**: `%APPDATA%\whoap\logs`
- **macOS**: `~/Library/Logs/whoap`
- **Linux**: `~/.config/whoap/logs`

### Manual Update Test

1. Build current version: `npm run build`
2. Install the built app
3. Change version in `package.json` (increment)
4. Build again: `npm run build`
5. Create GitHub release with new version
6. Open installed app
7. Should detect and offer update

---

## Best Practices

1. **Version Numbering**: Use semantic versioning (MAJOR.MINOR.PATCH)
2. **Changelog**: Always update CHANGELOG.md before releasing
3. **Testing**: Test updates on all platforms before releasing
4. **Beta Channel**: Use pre-releases for beta testing
5. **Backwards Compatibility**: Don't break older versions in updates
6. **Code Signing**: Sign your apps for best user experience
7. **Monitoring**: Check update success rates

---

## Advanced Configuration

### Custom Update Server

Instead of GitHub, you can use a custom server:

```yaml
# electron-builder.yml
publish:
  provider: generic
  url: https://updates.yourserver.com
```

### Differential Updates

Enable delta updates (smaller downloads):

```yaml
# electron-builder.yml
differentialDownload: true
```

### Staged Rollouts

Release to percentage of users:

```javascript
// In AutoUpdateManager.ts
autoUpdater.allowPrerelease = false;
autoUpdater.allowDowngrade = false;
```

---

## Support

For issues with auto-updates:

1. Check [electron-updater docs](https://www.electron.build/auto-update.html)
2. Review [GitHub Releases API](https://docs.github.com/en/rest/releases)
3. Check application logs
4. Open an issue on GitHub

---

## Quick Reference

### Commands

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build (no publish)
npm run build

# Build with publish
GH_TOKEN=xxx npm run build

# Test packaged app
npm run build && ./release/Whoap-Launcher-Setup-2.3.7.exe
```

### File Locations

| File | Path |
|------|------|
| Config | `electron-builder.yml` |
| Manager | `electron/managers/AutoUpdateManager.ts` |
| Settings UI | `src/pages/Settings.tsx` |
| Environment | `.env` |
| Releases | `./release/` |

---

**Last Updated**: 2024
**Version**: 2.3.7
