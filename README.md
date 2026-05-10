# Contractor Tracker

Internal app to manage contractual employees, monthly invoices, and vendor spend.

Built on Azure Static Web Apps + managed Azure Functions + Azure SQL.

## Stack

- **Frontend** — React 18 + Vite + React Router + Recharts (`/web`)
- **Backend** — Azure Functions Node.js v4 model (`/api`)
- **Database** — Azure SQL (wide-format `Contractors` table — see `sql/schema.sql`)
- **Auth** — Custom username/password via JWT in HTTP-only cookies. Four roles: `Admin`, `FinanceSPOC`, `Recruiter`, `Viewer`.

## Roles

| Role         | List | Read | Create | Edit             | Delete | Import | Export | Audit | Manage users |
|--------------|:----:|:----:|:------:|------------------|:------:|:------:|:------:|:-----:|:------------:|
| Admin        | ✅   | ✅   | ✅     | all columns      | ✅     | ✅     | ✅     | ✅    | ✅           |
| FinanceSPOC  | ✅   | ✅   | ✅     | finance + months | ❌     | ❌     | ✅     | ❌    | ❌           |
| Recruiter    | ✅   | ✅   | ✅     | recruiter cols   | ❌     | ❌     | ❌     | ❌    | ❌           |
| Viewer       | ✅   | ✅   | ❌     | —                | ❌     | ❌     | ❌     | ❌    | ❌           |

Column-level enforcement happens in `api/src/shared/columns.js`.

---

## First-time setup

### 1. Database

Connect to your Azure SQL DB (Azure Portal Query Editor or Azure Data Studio), then:

1. Run `sql/schema.sql` (creates tables, indexes, view, seed lookups). Skip if already done.
2. Run `sql/migrations/001_add_password_columns.sql` (adds password columns to `AppUsers`).

The migration is idempotent — safe to re-run.

### 2. JWT secret

Generate a random 32+ character string for signing tokens. PowerShell:

```powershell
[Convert]::ToBase64String([byte[]](1..48 | %{ Get-Random -Maximum 256 }))
```

Bash / WSL:

```bash
openssl rand -base64 48
```

Save it — you'll set it as an app setting (`JWT_SECRET`) both locally and in Azure.

### 3. API (local dev)

```bash
cd api
npm install
cp local.settings.json.example local.settings.json
# Edit local.settings.json:
#   - SQL_CONN  → your Azure SQL connection string
#   - JWT_SECRET → the secret you just generated
#   - leave NODE_ENV=development for local (drops Secure flag from cookies)

npm start              # Functions runtime on http://localhost:7071
```

### 4. Web (local dev)

```bash
cd web
npm install
```

Then start everything together via the SWA CLI (recommended — proxies cookies cleanly):

```bash
npm install -g @azure/static-web-apps-cli
swa start http://localhost:5173 --api-location ./api --run "cd web && npm run dev"
# Open http://localhost:4280
```

### 5. Bootstrap the first admin

The app has no users yet. Create the first admin via the bootstrap endpoint
(this only works while `dbo.AppUsers` is empty):

```powershell
$body = @{ email='you@celebal.com'; password='ChooseAStrongPassword123!'; displayName='Your Name' } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:4280/api/auth/bootstrap -Method POST `
  -Body $body -ContentType 'application/json'
```

Or curl:

```bash
curl -X POST http://localhost:4280/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"email":"you@celebal.com","password":"ChooseAStrongPassword123!","displayName":"Your Name"}'
```

You should get back `{ email, role: "Admin", message: "Bootstrap complete..." }`.

Now open http://localhost:4280 and sign in with that email + password.

### 6. Add team members

Once you're logged in as Admin, go to the **Users** page in the sidebar:

- Click **+ New user** → enter their email, name, role
- The system generates a 14-character temp password and shows it once
- Share it with the user (Teams DM, password manager — not over email)
- They'll be forced to change it on first login

To reset someone's password later, click **Reset password** on their row.

---

## Azure deployment

### Provision (one-time)

```powershell
$RG        = "rg-contractor-app"
$LOC       = "centralindia"
$SQLSERVER = "<your-existing-sql-server>"

# Static Web App (binds to your GitHub repo for CI/CD)
az staticwebapp create -n swa-contractor-app -g $RG `
  -s https://github.com/<org>/contractor-app -b main `
  --app-location "/web" --api-location "/api" --output-location "dist" `
  --login-with-github
```

### App settings

```powershell
az staticwebapp appsettings set -n swa-contractor-app -g $RG --setting-names `
  "SQL_CONN=Server=tcp:$SQLSERVER.database.windows.net,1433;Database=ContractorDB;User Id=sqladmin;Password=<pwd>;Encrypt=true;Connection Timeout=30" `
  "JWT_SECRET=<your-32-plus-char-random-string>"
```

**Don't set NODE_ENV** in production — its absence keeps cookies `Secure` (HTTPS only).

After CI/CD finishes the first deploy, hit your `/api/auth/bootstrap` endpoint once
(same call as step 5 above, just with the production hostname) to create the first admin.

---

## Architecture

```
Browser
   │ (HTTPS)
Azure Static Web App (React)
   │
Managed Azure Functions    →  Blob (optional, for Excel imports)
   │                       →  App Insights (logs/metrics)
   ▼
Azure SQL Database (Contractors, AuditLog, AppUsers, Vendors, Entities)
```

Auth flow: client posts to `/api/auth/login` with email+password → server verifies bcrypt
hash → issues JWT (8h expiry) → returns `Set-Cookie: cnt_token=...; HttpOnly; SameSite=Lax`.
Browser sends cookie automatically on every subsequent request. Logout clears the cookie.

## File map

```
api/
  src/
    functions/
      auth.js             login / logout / me / change-password / bootstrap
      users.js            user management (Admin only)
      contractors.js      CRUD with audit
      lookups.js          vendors, entities
      dashboard.js        aggregates
      audit.js            change history per HRMID
      importExcel.js      bulk upsert from xlsx
      exportExcel.js      download as xlsx
    shared/
      auth.js             JWT principal extraction + role check
      jwt.js              sign/verify
      passwords.js        bcrypt hash/compare
      cookies.js          parse + Set-Cookie
      columns.js          column whitelists per role
      audit.js            per-column diff writer
      db.js               mssql pool

web/
  src/
    pages/
      Login.jsx           sign-in form
      ChangePassword.jsx  first-login + self-service password change
      UsersPage.jsx       admin user management
      ContractorsList.jsx
      ContractorDetail.jsx
      Dashboard.jsx
      ImportPage.jsx
      AuditPage.jsx
    components/Layout.jsx sidebar + topbar (auth-gated)
    hooks/useAuth.js      reads /api/auth/me
    api/client.js         fetch wrapper with /login redirect on 401

sql/
  schema.sql                       full DDL + seed data
  migrations/
    001_add_password_columns.sql   adds password auth to AppUsers

staticwebapp.config.json           SPA fallback + security headers
.github/workflows/                 CI/CD to SWA
```

## Notes

- **Lockout**: 5 failed login attempts locks the account for 15 minutes (configurable in `auth.js`).
- **Session length**: 8 hours, configurable in `api/src/shared/jwt.js` (`EXPIRES_IN`).
- **Password reset**: admin-driven only (no email flow). Admin clicks "Reset password" → new temp shown once → user must change on next login.
- **Rotating JWT_SECRET**: invalidates *all* current sessions (everyone has to log in again). Do this if you suspect leakage.
