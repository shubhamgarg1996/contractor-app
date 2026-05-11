const { app } = require('@azure/functions');
const { getPool } = require('../shared/db');
const { getPrincipal, hasRole } = require('../shared/auth');
const { monthKeyToLabel } = require('../shared/months');

app.http('dashboard', {
  methods: ['GET'],
  route: 'dashboard',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin','FinanceSPOC','Recruiter','Viewer'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const pool = await getPool();

    const totalsP = pool.request().query(`
      SELECT
        TotalINR    = ISNULL((SELECT SUM(INRAmount) FROM dbo.ContractorMonthlyInvoice), 0),
        ActiveCount = SUM(CASE WHEN [Status]='Active' THEN 1 ELSE 0 END),
        ExitedCount = SUM(CASE WHEN [Status]='Exited' THEN 1 ELSE 0 END),
        TotalCount  = COUNT(*)
      FROM dbo.Contractors`);

    const byVendorP = pool.request().query(`
      SELECT VendorName = ISNULL(v.VendorName,'(unspecified)'),
             INR = ISNULL(SUM(i.INRAmount), 0)
      FROM dbo.Contractors c
      LEFT JOIN dbo.Vendors v ON v.VendorID = c.VendorID
      LEFT JOIN dbo.ContractorMonthlyInvoice i ON i.HRMID = c.HRMID
      GROUP BY v.VendorName
      HAVING ISNULL(SUM(i.INRAmount), 0) > 0
      ORDER BY INR DESC`);

    const byEntityP = pool.request().query(`
      SELECT EntityName = ISNULL(e.EntityName,'(unspecified)'),
             INR = ISNULL(SUM(i.INRAmount), 0)
      FROM dbo.Contractors c
      LEFT JOIN dbo.Entities e ON e.EntityID = c.EntityID
      LEFT JOIN dbo.ContractorMonthlyInvoice i ON i.HRMID = c.HRMID
      GROUP BY e.EntityName
      HAVING ISNULL(SUM(i.INRAmount), 0) > 0
      ORDER BY INR DESC`);

    const trendP = pool.request().query(`
      SELECT MonthKey, INR = SUM(INRAmount)
      FROM dbo.ContractorMonthlyInvoice
      WHERE INRAmount IS NOT NULL
      GROUP BY MonthKey
      ORDER BY MonthKey`);

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

    return { jsonBody: {
      totals:   totals.recordset[0],
      byVendor: byVendor.recordset,
      byEntity: byEntity.recordset,
      trend:    trend.recordset.map(r => ({
        Month: monthKeyToLabel(r.MonthKey),
        MonthKey: r.MonthKey,
        INR: r.INR
      })),
      expiring: expiring.recordset
    }};
  }
});
