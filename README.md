# Contractor Tracker

Internal app to manage contractual employees, monthly invoices, and vendor spend.

Built on Azure Static Web Apps + managed Azure Functions + Azure SQL — same blueprint as the Marketing Task Hub.

## Stack

- **Frontend** — React 18 + Vite + React Router + Recharts (`/web`)
- **Backend** — Azure Functions Node.js v4 model (`/api`)
- **Database** — Azure SQL (wide-format `Contractors` table — see `sql/schema.sql`)
- **Auth** — Microsoft Entra ID (built into SWA), four roles: `Admin`, `FinanceSPOC`, `Recruiter`, `Viewer`
- **Storage** — Blob (optional, for keeping copies of imported xlsx files)

## Roles

| Role         | List | Read | Create | Edit             | Delete | Import | Export | Audit |
|--------------|:----:|:----:|:------:|------------------|:------:|:------:|:------:|:-----:|
| Admin        | ✅   | ✅   | ✅     | all columns      | ✅     | ✅     | ✅     | ✅    |
| FinanceSPOC  | ✅   | ✅   | ✅     | finance + months | ❌     | ❌     | ✅     | ❌    |
| Recruiter    | ✅   | ✅   | ✅     | recruiter cols   | ❌     | ❌     | ❌     | ❌    |
| Viewer       | ✅   | ✅   | ❌     | —                | ❌     | ❌     | ❌     | ❌    |

Column-level enforcement happens in `api/src/shared/columns.js`.

## Local development

### 1. Database

```bash
# Either: connect to your Azure SQL DB via Azure Data Studio
# Or: run a local SQL Server (sqlcmd / Docker)
sqlcmd -S <server> -d ContractorDB -U <user> -P <pwd> -i sql/schema.sql
```

### 2. API (Functions)

```bash
cd api
npm install
cp local.settings.json.example local.settings.json
# Edit local.settings.json: set SQL_CONN to your connection string

# Run Functions on :7071
npm start
```

### 3. Web (Vite)

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

For full local SWA experience (auth + role emulation), use the SWA CLI:

```bash
npm install -g @azure/static-web-apps-cli
swa start http://localhost:5173 --api-location ../api --run "npm run dev"
# Then open http://localhost:4280
```

The SWA CLI lets you fake roles via `?clientPrincipal=...` or via the built-in
emulator login at `/.auth/login/aad?provider=aad`.

## Azure deployment

### Provision (one-time)

```bash
RG=rg-contractor-app
LOC=centralindia
SQLSERVER=sql-contractor-$RANDOM

az group create -n $RG -l $LOC

# Azure SQL
az sql server create -n $SQLSERVER -g $RG -u sqladmin -p '<strong-pwd>' -l $LOC
az sql db create -n ContractorDB -g $RG -s $SQLSERVER --service-objective S0
az sql server firewall-rule create -g $RG -s $SQLSERVER -n AllowAzure \
  --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0

# Static Web App (binds to your GitHub repo, sets up CI/CD)
az staticwebapp create -n swa-contractor-app -g $RG \
  -s https://github.com/<org>/contractor-app -b main \
  --app-location "/web" --api-location "/api" --output-location "dist" \
  --login-with-github
```

### App settings (Functions environment)

```bash
az staticwebapp appsettings set -n swa-contractor-app --setting-names \
  "SQL_CONN=Server=tcp:$SQLSERVER.database.windows.net,1433;Database=ContractorDB;User Id=sqladmin;Password=<pwd>;Encrypt=true;Connection Timeout=30" \
  "AAD_CLIENT_ID=<app-registration-client-id>" \
  "AAD_CLIENT_SECRET=<app-registration-secret>"
```

### Entra ID app registration

1. Azure Portal → Microsoft Entra ID → App registrations → New
2. Redirect URI: `https://<swa-default-hostname>.azurestaticapps.net/.auth/login/aad/callback`
3. Certificates & secrets → New client secret → copy value into `AAD_CLIENT_SECRET`
4. Update the `<tenant-id>` placeholder in `staticwebapp.config.json`

### Assigning user roles

In the Azure Portal → your Static Web App → Role management:

- **Invitation** → email + comma-separated roles (e.g. `Admin`) → send link
- Or set up a *roles function* to assign roles based on AD group membership (more scalable for larger teams)

## Architecture

```
Browser
   │ (HTTPS)
Azure Static Web App  ─── Entra ID (auth)
   │
Managed Azure Functions  ─── Blob (Excel imports, optional)
   │                     ─── App Insights (logs/metrics)
   ▼
Azure SQL Database (Contractors, AuditLog, Vendors, Entities, AppUsers)
```

## File map

```
api/
  src/
    functions/        HTTP triggers — one file per resource
    shared/
      auth.js         decode SWA principal header
      columns.js      column whitelists per role
      audit.js        write per-column diffs to AuditLog
      db.js           mssql pool

web/
  src/
    pages/            ContractorsList, ContractorDetail, Dashboard, ImportPage, AuditPage
    components/       Layout (sidebar + topbar)
    hooks/useAuth.js  reads /.auth/me
    api/client.js     fetch wrapper with 401 → AAD redirect

sql/schema.sql                       full DDL + seed data
staticwebapp.config.json             Entra ID + per-route role gates
.github/workflows/                   CI/CD to SWA
```

## Notes / next steps

- The `vw_ContractorMonthlyINR` view is a long-format projection over the wide table — useful for charting without restructuring storage.
- Excel import currently dedupes by HRMID and updates everything in a single transaction. For very large files (>10k rows) consider switching to a TVP-based bulk insert.
- Audit log captures column-level diffs on UPDATE and a single `BULK_IMPORT` row per import. Add a retention job if it grows fast.
- For schema changes, add migrations under `sql/migrations/` and apply them in deploy step.
