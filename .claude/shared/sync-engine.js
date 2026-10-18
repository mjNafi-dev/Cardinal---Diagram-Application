/* ============================================================================
   Cardinal hub sync engine — shared by hub.html and design-system.html
   ----------------------------------------------------------------------------
   What it does:
   • Chromium (Chrome / Edge / Helium): connect once to the project's `.claude`
     folder via the File System Access API. After that, every edit made in the
     browser is written straight back to the data .js files (auto-save), and
     the page polls the files so edits made by Claude/agentic AI while the page
     is open appear live — nothing gets lost in either direction.
   • Firefox / Zen / anything without the API: a warning banner is shown, but
     everything still works. Reads still pick up Claude's edits live (script
     re-injection polling works on file://). Writes buffer in localStorage and
     are exported as downloadable .js files you drop back into the data folder.

   Data file contract (also documented in CLAUDE.md) — the JSON payload sits
   between a DATA block-comment marker and an END block-comment marker:
     window.<GLOBAL> = window.<GLOBAL> || {};
     window.<GLOBAL>["<key>"] = <DATA marker>
     { ...valid JSON... }
     <END marker>;
   ============================================================================ */
(function () {
  "use strict";

  const IDB_NAME = "starterpack-sync";
  const IDB_STORE = "handles";

  /* ---------------- IndexedDB (persist the folder handle) ---------------- */
  function idbOpen() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open(IDB_NAME, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(IDB_STORE);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
  async function idbGet(key) {
    try {
      const db = await idbOpen();
      return await new Promise((res, rej) => {
        const rq = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    } catch (e) { return undefined; }
  }
  async function idbSet(key, val) {
    try {
      const db = await idbOpen();
      return await new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) { /* ignore */ }
  }

  /* ---------------------------- The engine ------------------------------- */
  const E = {
    cfg: null,
    mode: "fallback",       // "fs" (connected) | "fs-available" (not yet connected) | "fallback"
    root: null,             // FileSystemDirectoryHandle of the `.claude` folder
    state: {},              // key -> { diskJson, lastModified, dirty, saveTimer, conflictDisk }
    pollTimer: null,
    polling: false,

    /* cfg = {
         pageId:       "hub",                       // unique per page (localStorage namespace)
         globalVar:    "HUB_DATA",                  // window global the data files write into
         rootName:     ".claude",                   // expected picked folder name (advisory)
         validateDirs: ["project"],                 // subdirs that must exist in the picked folder
         pollMs:       2500,
         files: [{ key:"versions", src:"data/versions.js", fsPath:["project","data","versions.js"], label:"Versions" }],
         getLocal(key) -> object                    // page's current in-memory copy
         setLocal(key, obj)                         // replace page copy (external change accepted)
         onStatus(mode)                             // connection state changed
         onExternal(key)                            // disk change applied to page
         onConflict(key)                            // disk changed while page had unsaved edits
         onDirty(dirtyKeys[])                       // unsaved (fallback) edits changed
         onDrafts(keys[])                           // unexported drafts found from a previous session
       } */
    async init(cfg) {
      this.cfg = cfg;
      for (const f of cfg.files) this.state[f.key] = { diskJson: null, lastModified: 0, dirty: false, saveTimer: null, conflictDisk: null };
      // Baseline disk snapshot = whatever the <script> tags loaded at page open.
      for (const f of cfg.files) {
        const loaded = (window[cfg.globalVar] || {})[f.key];
        this.state[f.key].diskJson = JSON.stringify(loaded === undefined ? null : loaded);
      }
      this.mode = ("showDirectoryPicker" in window) ? "fs-available" : "fallback";

      // Previous-session drafts (fallback writes) — page decides restore/discard.
      const drafts = cfg.files.filter(f => localStorage.getItem(this._draftKey(f.key)) !== null).map(f => f.key);
      if (drafts.length && cfg.onDrafts) cfg.onDrafts(drafts);

      if (this.mode === "fs-available") {
        const saved = await idbGet("root:" + (cfg.pageRootId || "shared"));
        if (saved) {
          try {
            const perm = await saved.queryPermission({ mode: "readwrite" });
            if (perm === "granted") { this.root = saved; this.mode = "fs"; }
            else if (perm === "prompt") { this.root = saved; this.mode = "fs-reconnect"; }
          } catch (e) { /* stale handle */ }
        }
      }
      cfg.onStatus && cfg.onStatus(this.mode);
      this._startPolling();
    },

    /* ---- connect / reconnect (must be called from a user gesture) ---- */
    async connect() {
      if (!("showDirectoryPicker" in window)) return false;
      try {
        if (this.mode === "fs-reconnect" && this.root) {
          const perm = await this.root.requestPermission({ mode: "readwrite" });
          if (perm === "granted") { this.mode = "fs"; this.cfg.onStatus(this.mode); return true; }
        }
        const dir = await window.showDirectoryPicker({ mode: "readwrite" });
        // sanity check: does it look like the right folder?
        let ok = true;
        for (const sub of (this.cfg.validateDirs || [])) {
          try { await dir.getDirectoryHandle(sub); } catch (e) { ok = false; }
        }
        if (!ok && !confirm("This folder doesn't look like the project's `" + (this.cfg.rootName || ".claude") + "` folder (expected subfolder(s): " + (this.cfg.validateDirs || []).join(", ") + ").\n\nUse it anyway?")) return false;
        this.root = dir;
        this.mode = "fs";
        await idbSet("root:" + (this.cfg.pageRootId || "shared"), dir);
        // Flush any dirty/draft state straight to disk now that we can.
        for (const f of this.cfg.files) {
          if (this.state[f.key].dirty) await this.save(f.key);
        }
        this.cfg.onStatus(this.mode);
        return true;
      } catch (e) { return false; } // user cancelled picker
    },

    /* ------------------------- serialization ------------------------- */
    serialize(key, data) {
      return "window." + this.cfg.globalVar + " = window." + this.cfg.globalVar + " || {};\n"
        + "window." + this.cfg.globalVar + "[\"" + key + "\"] = /*DATA*/\n"
        + JSON.stringify(data, null, 2)
        + "\n/*END*/;\n";
    },
    parse(text) {
      const a = text.indexOf("/*DATA*/"), b = text.lastIndexOf("/*END*/");
      if (a === -1 || b === -1 || b <= a) throw new Error("markers not found");
      return JSON.parse(text.slice(a + 8, b).trim());
    },

    /* --------------------------- editing --------------------------- */
    // Page calls this after ANY local mutation.
    touch(key) {
      const st = this.state[key];
      st.dirty = true;
      if (this.mode === "fs") {
        clearTimeout(st.saveTimer);
        st.saveTimer = setTimeout(() => this.save(key), 600);
      } else {
        localStorage.setItem(this._draftKey(key), JSON.stringify({ t: Date.now(), data: this.cfg.getLocal(key) }));
        this._emitDirty();
      }
    },

    async save(key) {
      if (this.mode !== "fs") return false;
      const st = this.state[key];
      clearTimeout(st.saveTimer);
      const data = this.cfg.getLocal(key);
      try {
        const fh = await this._fileHandle(key);
        const w = await fh.createWritable();
        await w.write(this.serialize(key, data));
        await w.close();
        const file = await fh.getFile();
        st.lastModified = file.lastModified;
        st.diskJson = JSON.stringify(data);
        st.dirty = false;
        st.conflictDisk = null;
        localStorage.removeItem(this._draftKey(key));
        this._emitDirty();
        return true;
      } catch (e) {
        console.error("save failed for", key, e);
        // fall back to draft so nothing is lost
        localStorage.setItem(this._draftKey(key), JSON.stringify({ t: Date.now(), data }));
        this._emitDirty();
        return false;
      }
    },

    /* --------------------------- polling --------------------------- */
    _startPolling() {
      const ms = this.cfg.pollMs || 2500;
      this.pollTimer = setInterval(() => this._pollAll(), ms);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this._pollAll(); });
    },
    async _pollAll() {
      if (this.polling) return;
      this.polling = true;
      try {
        for (const f of this.cfg.files) {
          if (this.mode === "fs") await this._pollFs(f);
          else await this._pollScript(f);
        }
      } finally { this.polling = false; }
    },
    async _pollFs(f) {
      const st = this.state[f.key];
      try {
        const fh = await this._fileHandle(f.key);
        const file = await fh.getFile();
        if (file.lastModified === st.lastModified && st.lastModified !== 0) return;
        const text = await file.text();
        let data;
        try { data = this.parse(text); }
        catch (e) { return; } // half-written file (Claude mid-edit) — next poll gets it
        st.lastModified = file.lastModified;
        this._applyDisk(f.key, data);
      } catch (e) { /* file missing / permission lapsed — ignore this round */ }
    },
    _pollScript(f) {
      // Re-inject the data <script> with a cache-buster; works on file:// in
      // both Chromium and Firefox. The script only re-assigns its own key.
      return new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = f.src + (f.src.includes("?") ? "&" : "?") + "t=" + Date.now();
        s.onload = () => {
          try {
            const data = (window[this.cfg.globalVar] || {})[f.key];
            this._applyDisk(f.key, data);
          } catch (e) { /* ignore */ }
          s.remove(); resolve();
        };
        s.onerror = () => { s.remove(); resolve(); };
        document.head.appendChild(s);
      });
    },
    _applyDisk(key, data) {
      const st = this.state[key];
      const j = JSON.stringify(data === undefined ? null : data);
      if (j === st.diskJson) return;               // nothing new
      st.diskJson = j;
      if (st.dirty) {                              // both sides changed → conflict
        st.conflictDisk = data;
        this.cfg.onConflict && this.cfg.onConflict(key);
      } else {
        this.cfg.setLocal(key, data);
        this.cfg.onExternal && this.cfg.onExternal(key);
      }
    },

    /* ------------------------ conflict resolve ------------------------ */
    // choice: "mine" (my page edits win) | "disk" (take what's on disk)
    async resolveConflict(key, choice) {
      const st = this.state[key];
      if (choice === "disk") {
        if (st.conflictDisk !== null && st.conflictDisk !== undefined) this.cfg.setLocal(key, st.conflictDisk);
        st.dirty = false;
        st.conflictDisk = null;
        localStorage.removeItem(this._draftKey(key));
        this._emitDirty();
        this.cfg.onExternal && this.cfg.onExternal(key);
      } else {
        st.conflictDisk = null;
        if (this.mode === "fs") await this.save(key);
        else this.touch(key); // stays a draft; export when ready
      }
    },

    /* --------------------- fallback draft / export --------------------- */
    restoreDraft(key) {
      const raw = localStorage.getItem(this._draftKey(key));
      if (!raw) return false;
      try {
        const d = JSON.parse(raw);
        this.cfg.setLocal(key, d.data);
        this.state[key].dirty = true;
        this._emitDirty();
        return true;
      } catch (e) { return false; }
    },
    discardDraft(key) {
      localStorage.removeItem(this._draftKey(key));
      this.state[key].dirty = false;
      this._emitDirty();
    },
    dirtyKeys() { return this.cfg.files.filter(f => this.state[f.key].dirty).map(f => f.key); },
    download(key) {
      const f = this.cfg.files.find(x => x.key === key);
      const blob = new Blob([this.serialize(key, this.cfg.getLocal(key))], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.fsPath[f.fsPath.length - 1];
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    downloadDirty() { for (const k of this.dirtyKeys()) this.download(k); },
    // After the user drops exported files back into the data folder:
    markExported() {
      for (const f of this.cfg.files) {
        if (this.state[f.key].dirty) {
          this.state[f.key].diskJson = JSON.stringify(this.cfg.getLocal(f.key));
          this.state[f.key].dirty = false;
          localStorage.removeItem(this._draftKey(f.key));
        }
      }
      this._emitDirty();
    },

    /* ----------------------------- utils ----------------------------- */
    async _fileHandle(key) {
      const f = this.cfg.files.find(x => x.key === key);
      let dir = this.root;
      for (let i = 0; i < f.fsPath.length - 1; i++) dir = await dir.getDirectoryHandle(f.fsPath[i]);
      return dir.getFileHandle(f.fsPath[f.fsPath.length - 1], { create: true });
    },
    _draftKey(key) { return "sp_draft::" + this.cfg.pageId + "::" + key; },
    _emitDirty() { this.cfg.onDirty && this.cfg.onDirty(this.dirtyKeys()); }
  };

  window.SyncEngine = E;
})();
