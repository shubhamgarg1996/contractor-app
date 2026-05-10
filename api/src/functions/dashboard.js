const { app } = require('@azure/functions');
const { getPool } = require('../shared/db');
const { getPrincipal, hasRole } = require('../shared/auth');
const { MONTH_LABELS } = require('../shared/columns');

app.http('dashboard', {
  methods: ['GET'],
  route: 'dashboard',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin','FinanceSPOC','Recruiter','Viewer'))
      return { status: 401, body: 'Unauthorized' };

    const pool = await getPool();
    // Sum across every month INR column
    const sumExpr = MONTH_LABELS.map(([, k]) => `ISNULL(${k}_INR,0)`).join('+');

    const totalsP = pool.request().query(`
      SELECT TotalINR    = SUM(${sumExpr}),
             ActiveCount = SUM(CASE WHEN [Status]='Active' THEN 1 ELSE 0 END),
             ExitedCount = SUM(CASE WHEN [Status]='Exited' THEN 1 ELSE 0 END),
             TotalCount  = COUNT(*)
      FROM dbo.Contractors`);

    const byVendorP = pool.request().query(`
      SELECT VendorName = ISNULL(v.VendorName,'(unspecified)'),
             INR = SUM(${sumExpr})
      FROM dbo.Contractors c
      LEFT JOIN dbo.Vendors v ON v.VendorID = c.VendorID
      GROUP BY v.VendorName
      ORDER BY INR DESC`);

    const byEntityP = pool.request().query(`
      SELECT EntityName = ISNULL(e.EntityName,'(unspecified)'),
             INR = SUM(${sumExpr})
      FROM dbo.Contractors c
      LEFT JOIN dbo.Entities e ON e.EntityID = c.EntityID
      GROUP BY e.EntityName
      ORDER BY INR DESC`);

    const trendP = pool.request().query(`
      SELECT [Month], INR = SUM(INR)
      FROM dbo.vw_ContractorMonthlyINR
      GROUP BY [Month]`);

    const expiringP = pool.request().query(`
      SELECT TOP 25 c.HRMID, c.[Name], c.ContractEndDate,
             VendorName = v.VendorName,
             DaysLeft   = DATEDIFF(DAY, CAST(GETDATE() AS DATE), c.ContractEndDate)
      FROM dbo.Contractors c
      LEFT JOIN dbo.Vendors v ON v.VendorID = c.VendorID
      WHERE c.ContractEndDate IS NOT NULL
        AND c.ContractEndDate >= CAST(GETDATE() AS DATE)
        AND c.ContractEndDate <= DATEADD(DAY, 90, CAST(GETDATE() AS DATE))
      ORDER BY c.ContractEndDate`);

    const [totals, byVendor, byEntity, trend, expiring] =
      await Promise.all([totalsP, byVendorP, byEntityP, trendP, expiringP]);

    // Trend: sort in calendar order
    const order = MONTH_LABELS.map(([label]) => label);
    const trendSorted = trend.recordset
      .filter(r => r.INR != null)
      .sort((a, b) => order.indexOf(a.Month) - order.indexOf(b.Month));

    return { jsonBody: {
      totals:   totals.recordset[0],
      byVendor: byVendor.recordset,
      byEntity: byEntity.recordset,
      trend:    trendSorted,
      expiring: expiring.recordset
    }};
  }
});
