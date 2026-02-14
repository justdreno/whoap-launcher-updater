# Whoap Launcher Roadmap

> The Next Level Minecraft Launcher

**Current Version:** 2.3.7  
**Status:** Active Development

---

## 📋 Table of Contents

- [Completed Features](#completed-features)
- [Short-Term Goals (v2.4.x)](#short-term-goals-v24x)
- [Mid-Term Goals (v2.5.x)](#mid-term-goals-v25x)
- [Long-Term Goals (v3.0)](#long-term-goals-v30)
- [Technical Improvements](#technical-improvements)
- [Bug Fixes & Polish](#bug-fixes--polish)

---

## ✅ Completed Features

### Core Launcher
- [x] Multi-instance support with separate game directories
- [x] Microsoft account authentication
- [x] Offline mode support
- [x] Custom Java path configuration per version
- [x] Instance duplication and export (.zip)
- [x] External instance import (TLauncher, etc.)
- [x] Instance favorites system
- [x] Last played tracking

### Mod Management
- [x] Mod browser and installer
- [x] Modpack browser integration
- [x] Resource pack management
- [x] Shader pack management
- [x] CustomSkinLoader integration with instance-specific skins
- [x] Mod dependency resolution

### User Experience
- [x] Custom title bar with minimize/maximize/close
- [x] Dark theme UI
- [x] Animations toggle in settings
- [x] Resizable window support
- [x] Customizable JVM arguments
- [x] JVM presets (Potato, Standard, Pro, Extreme)

### Cloud & Social
- [x] Cloud saves for Whoap accounts
- [x] Screenshot upload and management
- [x] Discord Rich Presence integration
- [x] Server status checker
- [x] Featured servers list

### Skin & Cosmetics
- [x] 3D skin viewer
- [x] Skin switching
- [x] Cape support (via CustomSkinLoader)
- [x] Elytra rendering

### Network
- [x] Proxy support (HTTP/SOCKS5)
- [x] Update system with auto-check
- [x] Offline mode capabilities

---

## 🚀 Short-Term Goals (v2.4.x)

### Performance & Optimization
- [ ] Optimize startup time
- [ ] Reduce memory footprint
- [ ] Implement instance caching
- [ ] Background asset preloading
- [ ] Parallel mod downloads

### UI/UX Improvements
- [ ] Instance grid view option
- [ ] Drag-and-drop instance reordering
- [ ] Quick search in all pages
- [ ] Keyboard shortcuts (Ctrl+N for new instance, etc.)
- [ ] Instance tags/categories
- [ ] Recently played games list on Home
- [ ] Custom instance icons from URL

### Mod Management Enhancements
- [ ] Mod config editor integration
- [ ] Mod conflict detection
- [ ] Auto-update mods
- [ ] Mod changelog viewer
- [ ] Export mod list as CSV/JSON
- [ ] Import mod list

### Instance Features
- [ ] Instance backup/restore
- [ ] Auto-backup before mod changes
- [ ] Instance snapshots
- [ ] Version downgrade support
- [ ] Instance templates (create from preset)

---

## 🎯 Mid-Term Goals (v2.5.x)

### Account System
- [ ] Multiple account switching
- [ ] Account switching during game
- [ ] Account-specific settings
- [ ] Legacy Mojang account migration helper
- [ ] Alt account management

### Mod Platform Integrations
- [ ] CurseForge API integration
- [ ] Modrinth API integration
- [ ] Direct modpack installation from URL
- [ ] Modpack sharing via code
- [ ] Auto-detect mod loader from modpack

### Server Features
- [ ] Server list with direct connect
- [ ] Server history
- [ ] Auto-join server on launch
- [ ] Server resource pack auto-download toggle
- [ ] Server MOTD preview

### Screenshot & Media
- [ ] Screenshot editing tools
- [ ] Video recording integration (OBS plugin)
- [ ] Gallery view for screenshots
- [ ] Screenshot folders by instance
- [ ] Bulk screenshot operations

### Launcher Enhancements
- [ ] Portable mode support
- [ ] Command-line interface (CLI)
- [ ] Portable instances
- [ ] Instance sync across devices
- [ ] Export launcher settings

---

## 🌟 Long-Term Goals (v3.0)

### Cross-Platform
- [ ] Linux support
- [ ] macOS support
- [ ] Mobile companion app (view only)

### Advanced Features
- [ ] Built-in skin editor
- [ ] Resource pack creator tools
- [ ] Shader configuration UI
- [ ] World management (backup, transfer)
- [ ] Statistics dashboard
- [ ] Achievement tracking

### Social Features (v2.x)
- [ ] ~~Friends system~~ (Hidden in v2.3.7, may return in v3.0)
- [ ] Instance sharing with friends
- [ ] Server recommendations
- [ ] Community modpacks

### Marketplace
- [ ] Custom content marketplace
- [ ] Creator tools
- [ ] Rating system
- [ ] Verified content badges

---

## 🔧 Technical Improvements

### Code Quality
- [ ] Comprehensive test coverage
- [ ] E2E testing with Playwright
- [ ] TypeScript strict mode
- [ ] ESLint rule improvements
- [ ] Component documentation

### Architecture
- [ ] Plugin system architecture
- [ ] Theme system (custom CSS)
- [ ] API for third-party integrations
- [ ] Better error handling and logging
- [ ] Crash reporter

### Security
- [ ] Sandboxed mod downloads
- [ ] File integrity checks
- [ ] Secure credential storage
- [ ] 2FA support for Whoap accounts

### Performance
- [ ] Virtual scrolling for large lists
- [ ] Lazy loading for images
- [ ] Service worker for offline support
- [ ] Asset optimization

---

## 🐛 Bug Fixes & Polish

### Known Issues
- [ ] Fix memory leak in skin viewer
- [ ] Improve offline mode stability
- [ ] Handle large instance imports better
- [ ] Fix mod download interruptions
- [ ] Improve error messages

### Polish
- [ ] Loading states for all async operations
- [ ] Better empty states
- [ ] Improved error boundaries
- [ ] Consistent spacing and typography
- [ ] Dark/Light theme toggle (currently dark only)

---

## 📝 Notes

### Versioning Strategy
- **Patch (x.x.X)**: Bug fixes and small improvements
- **Minor (x.X.x)**: New features, backward compatible
- **Major (X.x.x)**: Breaking changes, major rewrites

### Release Schedule
- Patch releases: As needed
- Minor releases: Monthly
- Major releases: Annually

### Contributing
We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

### Feedback
- GitHub Issues: https://github.com/justdreno/Whoap-Launcer/issues
- Discord: https://dsc.gg/whoap

---

*Last Updated: February 2026*
*This roadmap is subject to change based on community feedback and development priorities.*
