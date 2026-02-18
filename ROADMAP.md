# Whoap Launcher - Development Roadmap

> Current Status: **Phase 1.5** - Core offline infrastructure complete, applying to UI

---

## ✅ Completed (Last Sprint)

### Infrastructure
- [x] **OfflineManager** - Real-time offline detection with periodic checks
- [x] **CacheManager** - File-based caching system for all data
- [x] **useOfflineStatus** hook - React integration for offline state
- [x] **OfflineButton** component - Smart buttons that disable when offline
- [x] **Offline banner** - App-wide offline indicator

### Version Caching
- [x] Vanilla Minecraft version manifests cached
- [x] Fabric loader versions cached
- [x] Forge/NeoForge/Quilt loader versions cached
- [x] Version details JSON cached
- [x] 1-week cache expiration with fallback
- [x] Cache status API for UI

### Documentation
- [x] **README.md** - Complete project documentation
- [x] **UI_GUIDELINES.md** - Design system and component standards
- [x] Code comments and TypeScript types

---

## 🚧 In Progress (Current Sprint)

### Apply Offline UI to All Download Features
**Priority: HIGH | Est: 2-3 hours**

Files to update:
- [ ] `src/components/CreateInstanceModal.tsx` - Mod preset downloads
- [ ] `src/pages/ModpackBrowser.tsx` - Modpack install button
- [ ] `src/pages/ModsManager.tsx` - Individual mod downloads
- [ ] `src/pages/ModpackBrowser.tsx` - Search functionality (disable when offline)

Implementation:
```tsx
import { OfflineButton } from '../components/OfflineButton';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

// For buttons
<OfflineButton 
  offlineDisabled={true}
  offlineTooltip="Internet connection required to download"
  onClick={handleDownload}
>
  <Download size={16} /> Download Mod
</OfflineButton>

// For showing offline messages
const isOffline = useOfflineStatus();
{isOffline && (
  <div className={styles.offlineMessage}>
    <WifiOff size={16} />
    <span>Downloads unavailable while offline</span>
  </div>
)}
```

---

## 📋 Upcoming Tasks (Priority Order)

### 1. News & Content Caching
**Priority: HIGH | Est: 4-6 hours**

**Files:**
- `src/utils/ContentManager.ts`
- `src/pages/News.tsx`
- `electron/utils/CacheManager.ts` (extend)

**Tasks:**
- [ ] Cache news articles to LocalStorage
- [ ] Cache article images to filesystem
- [ ] Cache changelogs
- [ ] Add "Cached" badge to old content
- [ ] Show last updated timestamp
- [ ] Auto-purge cache older than 30 days
- [ ] Add refresh button to refetch when online

**UI Changes:**
- Show "Last updated: X days ago" on cached content
- Disable "Load More" when offline and no cached data
- Show offline indicator in news header

---

### 2. Skin & Avatar Caching
**Priority: MEDIUM | Est: 3-4 hours**

**Files:**
- `src/utils/SkinUtils.ts`
- `electron/protocol-handlers.ts`
- `electron/utils/SkinCacheManager.ts` (new)

**Tasks:**
- [ ] Cache player skins to `skins/` folder
- [ ] Cache player avatars to `avatars/` folder
- [ ] Cache cape images
- [ ] Serve from cache in protocol handler
- [ ] Queue skin updates for when online
- [ ] Fallback to Steve/Alex if no cache

**Implementation:**
```typescript
// In SkinUtils.ts
export const SkinUtils = {
  getSkinUrl: (username: string, type: 'head' | 'body', lastUpdated?: number) => {
    // Check cache first
    const cached = SkinCacheManager.getCachedSkin(username);
    if (cached) return cached;
    
    // Fallback to online API
    if (navigator.onLine) {
      const url = `https://mc-heads.net/${type}/${username}`;
      SkinCacheManager.cacheSkin(username, url);
      return url;
    }
    
    // Return default if offline and no cache
    return '/assets/steve.png';
  }
};
```

---

### 3. Java Runtime Caching
**Priority: MEDIUM | Est: 2-3 hours**

**Files:**
- `electron/launcher/JavaManager.ts`
- `electron/utils/CacheManager.ts`

**Tasks:**
- [ ] Cache Java download manifests
- [ ] Cache Java version metadata
- [ ] Skip version check when offline
- [ ] Verify local Java without online check
- [ ] Show cached Java version in settings

---

### 4. Cloud Sync Queue System
**Priority: HIGH | Est: 6-8 hours**

**Files:**
- `src/utils/SyncQueue.ts` (new)
- `src/utils/CloudManager.ts`
- `electron/managers/CloudManager.ts`

**Tasks:**
- [ ] Create persistent action queue (LocalStorage + file)
- [ ] Queue actions: instance create/update/delete
- [ ] Queue actions: skin changes
- [ ] Queue actions: settings updates
- [ ] Process queue when back online
- [ ] Show "Sync pending" badge in UI
- [ ] Persist queue across app restarts

**UI Changes:**
- Badge showing "X changes pending sync"
- Sync button to manually trigger
- Last sync timestamp

---

### 5. Conflict Resolution UI
**Priority: MEDIUM | Est: 4-6 hours**

**Files:**
- `src/components/ConflictResolver.tsx` (new)
- `src/utils/SyncQueue.ts`

**Tasks:**
- [ ] Detect conflicts (local vs cloud changes)
- [ ] Show conflict resolution modal
- [ ] Options: Use Local, Use Cloud, Merge
- [ ] Remember choices per-instance
- [ ] Bulk resolve conflicts

**UI:**
```tsx
<ConflictResolver 
  conflicts={conflicts}
  onResolve={handleResolve}
  onResolveAll={handleResolveAll}
/>
```

---

### 6. Background Sync
**Priority: LOW | Est: 3-4 hours**

**Files:**
- `electron/background-sync.ts` (new)
- `electron/main.ts`

**Tasks:**
- [ ] Auto-sync on app start (if online)
- [ ] Periodic sync every 15 minutes
- [ ] Sync on app shutdown
- [ ] Background sync progress indicator
- [ ] Handle sync errors gracefully

---

## 🎯 Quick Wins (Do These First)

1. **Apply OfflineButton to downloads** (2 hours) ⬅️ NEXT
2. **Cache news articles** (3 hours)
3. **Cache skins** (3 hours)
4. **Sync queue basic implementation** (4 hours)

---

## 📊 Current Progress

| Phase | Items | Complete | Status |
|-------|-------|----------|--------|
| Phase 1: Cache Critical Data | 4 | 2.5 | 🟡 In Progress |
| Phase 2: Offline UI States | 3 | 1 | 🟡 In Progress |
| Phase 3: Smart Sync | 3 | 0 | 🔴 Not Started |
| Phase 4: Advanced Features | 3 | 0 | 🔴 Not Started |

**Overall: 40% Complete**

---

## 🧪 Testing Checklist

Before marking complete:

- [ ] Launch game while completely offline
- [ ] Version lists display from cache
- [ ] Download buttons disabled with tooltip
- [ ] Browse cached news offline
- [ ] View cached skins offline
- [ ] Make changes offline (queue for sync)
- [ ] Reconnect and watch sync happen
- [ ] Resolve conflicts after offline changes
- [ ] Check all pages show proper offline state

---

## 📝 Notes

### Cache Strategy
- **File Cache**: Used for version manifests, large JSON files
- **LocalStorage**: Used for news, changelogs, small data
- **Filesystem**: Used for skins, images, binaries
- **TTL**: 1 week for versions, 30 days for news

### Offline UI Pattern
1. Detect offline state (useOfflineStatus hook)
2. Disable action buttons (OfflineButton component)
3. Show offline indicator/banner
4. Load from cache
5. Queue changes for sync

### Performance Considerations
- Cache is checked first (fast)
- Network request only if cache miss or explicit refresh
- Images cached to disk to prevent memory bloat
- Queue persisted to survive app restart

---

## 🚀 Next Actions

1. **Today**: Apply OfflineButton to all download UIs
2. **Tomorrow**: Implement news caching
3. **This Week**: Skin caching + basic sync queue
4. **Next Week**: Full sync system + conflict resolution

---

Last Updated: 2024
Maintained by: Whoap Dev Team
