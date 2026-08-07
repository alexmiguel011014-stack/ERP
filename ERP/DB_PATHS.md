# Database Paths — ERP

## Overview

The project uses a single SQLite database encrypted with SQLCipher. The path varies between dev and production environments.

---

## 1. Active Database (Production)

| Property | Value |
|---|---|
| **Path** | `%APPDATA%/ERP/erp.sqlite` |
| **Resolved at runtime** | `app.getPath('userData')` in Electron main process |
| **Set by** | `setDBPath(app.getPath('userData'))` in `main.js:139` |
| **Used by** | `database.js` via `DB_PATH` variable |
| **Status** | Crypted (SQLCipher), key derived from app password via SHA-256 |
| **Contents** | 7 main tables + `MovimentacoesEstoque`, `Fornecedores`, `PedidosCompra`, `LancamentosFinanceiros` |

## 2. Dev Database (Legacy)

| Property | Value |
|---|---|
| **Path** | `./data/erp.sqlite` |
| **Resolved at runtime** | `path.join(__dirname, 'erp.sqlite')` in `database.js:7` |
| **Used by** | `database.js` default `DB_PATH` (before `setDBPath` is called) |
| **Status** | Gitignored (`data/` in `.gitignore`) |
| **Note** | Only used when `setDBPath` is NOT called (e.g., direct `node database.js` testing) |

## 3. Backup Files

| Path | Description |
|---|---|
| `data/backups/backup_YYYY-MM-DD.sqlite` | Daily automatic backup (dev) |
| `%APPDATA%/ERP/backups/backup_TIMESTAMP.sqlite` | Daily automatic backup (production) |
| `data/backups/backup_2026-08-01.sqlite` | Existing dev backup (32 KB) |

Backup logic in `database.js`:
- Full backup: `database.js:1719–1748` (function `fazerBackup`)
- Daily backup: `database.js:1997–2006` (function `backupDiario`)

## 4. Encryption Key File

| Path | Description |
|---|---|
| `%APPDATA%/ERP/erp_perfis.json` | Stores AES-256-GCM wrapped key for vendedor password |
| `data/erp_perfis.json` | Dev equivalent |
| **Resolved by** | `database.js:2574` → `path.join(path.dirname(DB_PATH), 'erp_perfis.json')` |

## 5. Migration/Intermediate Files

| Path | Description |
|---|---|
| `DB_PATH + '.enc'` | Temporary file during SQLCipher migration (`database.js:72`) |
| `DB_PATH + '.tmp'` | Temporary file during backup restore (`database.js:1741`) |

## 6. Build / Dist

| Path | Description |
|---|---|
| `dist/win-unpacked/resources/app.asar` | Packed app source (includes `database.js`, `main.js`, `preload.js`) |
| `dist/Alga-ERP-Setup-1.0.4.exe` | NSIS installer |

## 7. Gitignored Paths

From `.gitignore`:
```
data/
*.sqlite
*.sqlite3
```

## 8. Key Code References

| File | Line(s) | What |
|---|---|---|
| `database.js` | 7 | Default `DB_PATH` = `./data/erp.sqlite` |
| `database.js` | 9–10 | `setDBPath(basePath)` overrides `DB_PATH` |
| `database.js` | 38 | `dbDir = path.dirname(DB_PATH)` |
| `database.js` | 42 | `new sqlite3.Database(DB_PATH, ...)` |
| `database.js` | 115 | Log: `Banco de dados desbloqueado em: ${DB_PATH}` |
| `database.js` | 1500 | `return DB_PATH` (exposed via IPC) |
| `database.js` | 1719–1727 | Backup logic (timestamped) |
| `database.js` | 1997–2006 | Daily backup logic (date-stamped) |
| `database.js` | 2574 | `erp_perfis.json` path derived from `DB_PATH` |
| `main.js` | 139 | `setDBPath(app.getPath('userData'))` — production path |
| `main.js` | 748 | `desbloquearBanco` handler |
| `main.js` | 761 | `trocarChave` handler (rekey on password change) |
| `preload.js` | 41–43 | Backup IPC exposure |

## 9. Environment Flow

```
Electron app starts
  → main.js calls setDBPath(app.getPath('userData'))
    → DB_PATH = "%APPDATA%/ERP/erp.sqlite"
  → database.js opens DB with SQLCipher
    → Key derived from SHA-256("erp_housekimono:" + senha)
    → PRAGMA key decrypts the database
  → On first login (plaintext DB detected):
    → sqlcipher_export('encrypted') migrates to encrypted
    → Backup of plaintext kept as .enc temp file
```