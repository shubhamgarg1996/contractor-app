-- =====================================================
-- 002_long_invoices.sql
-- Migrate monthly invoices from wide (30 columns on
-- dbo.Contractors) to long (one row per contractor-month
-- in dbo.ContractorMonthlyInvoice). Idempotent — safe to
-- re-run.
-- =====================================================

SET XACT_ABORT ON;
BEGIN TRAN;

-- 1. Create the long table -----------------------------
IF OBJECT_ID('dbo.ContractorMonthlyInvoice','U') IS NULL
BEGIN
    CREATE TABLE dbo.ContractorMonthlyInvoice (
        HRMID         NVARCHAR(50)  NOT NULL,
        MonthKey      CHAR(7)       NOT NULL,          -- format 'YYYY-MM' (e.g. '2025-01')
        InvoiceAmount DECIMAL(18,2) NULL,              -- in original currency (Currency column on Contractors)
        INRAmount     DECIMAL(18,2) NULL,
        UpdatedAt     DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedBy     NVARCHAR(255) NULL,
        CONSTRAINT PK_ContractorMonthlyInvoice PRIMARY KEY (HRMID, MonthKey),
        CONSTRAINT FK_CMI_Contractors FOREIGN KEY (HRMID)
            REFERENCES dbo.Contractors(HRMID) ON DELETE CASCADE,
        CONSTRAINT CK_CMI_MonthKey CHECK (MonthKey LIKE '[0-9][0-9][0-9][0-9]-[0-1][0-9]')
    );

    CREATE INDEX IX_CMI_MonthKey ON dbo.ContractorMonthlyInvoice(MonthKey);
END;

-- 2. Migrate existing wide-format data → long ----------
-- Skips if data was already migrated (avoid duplicates on re-run).
IF (SELECT COUNT(*) FROM dbo.ContractorMonthlyInvoice) = 0
   AND COL_LENGTH('dbo.Contractors','Jan25_Inv') IS NOT NULL
BEGIN
    INSERT INTO dbo.ContractorMonthlyInvoice (HRMID, MonthKey, InvoiceAmount, INRAmount)
    SELECT c.HRMID, m.MonthKey,
           CASE m.MonthKey
                WHEN '2025-01' THEN c.Jan25_Inv WHEN '2025-02' THEN c.Feb25_Inv
                WHEN '2025-03' THEN c.Mar25_Inv WHEN '2025-04' THEN c.Apr25_Inv
                WHEN '2025-05' THEN c.May25_Inv WHEN '2025-06' THEN c.Jun25_Inv
                WHEN '2025-07' THEN c.Jul25_Inv WHEN '2025-08' THEN c.Aug25_Inv
                WHEN '2025-09' THEN c.Sep25_Inv WHEN '2025-10' THEN c.Oct25_Inv
                WHEN '2025-11' THEN c.Nov25_Inv WHEN '2025-12' THEN c.Dec25_Inv
                WHEN '2026-01' THEN c.Jan26_Inv WHEN '2026-02' THEN c.Feb26_Inv
                WHEN '2026-03' THEN c.Mar26_Inv
           END AS InvoiceAmount,
           CASE m.MonthKey
                WHEN '2025-01' THEN c.Jan25_INR WHEN '2025-02' THEN c.Feb25_INR
                WHEN '2025-03' THEN c.Mar25_INR WHEN '2025-04' THEN c.Apr25_INR
                WHEN '2025-05' THEN c.May25_INR WHEN '2025-06' THEN c.Jun25_INR
                WHEN '2025-07' THEN c.Jul25_INR WHEN '2025-08' THEN c.Aug25_INR
                WHEN '2025-09' THEN c.Sep25_INR WHEN '2025-10' THEN c.Oct25_INR
                WHEN '2025-11' THEN c.Nov25_INR WHEN '2025-12' THEN c.Dec25_INR
                WHEN '2026-01' THEN c.Jan26_INR WHEN '2026-02' THEN c.Feb26_INR
                WHEN '2026-03' THEN c.Mar26_INR
           END AS INRAmount
    FROM dbo.Contractors c
    CROSS JOIN (VALUES
        ('2025-01'),('2025-02'),('2025-03'),('2025-04'),('2025-05'),('2025-06'),
        ('2025-07'),('2025-08'),('2025-09'),('2025-10'),('2025-11'),('2025-12'),
        ('2026-01'),('2026-02'),('2026-03')
    ) AS m(MonthKey)
    WHERE
        -- Only insert rows where at least one of the two values is non-null
        (CASE m.MonthKey
                WHEN '2025-01' THEN c.Jan25_Inv WHEN '2025-02' THEN c.Feb25_Inv
                WHEN '2025-03' THEN c.Mar25_Inv WHEN '2025-04' THEN c.Apr25_Inv
                WHEN '2025-05' THEN c.May25_Inv WHEN '2025-06' THEN c.Jun25_Inv
                WHEN '2025-07' THEN c.Jul25_Inv WHEN '2025-08' THEN c.Aug25_Inv
                WHEN '2025-09' THEN c.Sep25_Inv WHEN '2025-10' THEN c.Oct25_Inv
                WHEN '2025-11' THEN c.Nov25_Inv WHEN '2025-12' THEN c.Dec25_Inv
                WHEN '2026-01' THEN c.Jan26_Inv WHEN '2026-02' THEN c.Feb26_Inv
                WHEN '2026-03' THEN c.Mar26_Inv END) IS NOT NULL
        OR
        (CASE m.MonthKey
                WHEN '2025-01' THEN c.Jan25_INR WHEN '2025-02' THEN c.Feb25_INR
                WHEN '2025-03' THEN c.Mar25_INR WHEN '2025-04' THEN c.Apr25_INR
                WHEN '2025-05' THEN c.May25_INR WHEN '2025-06' THEN c.Jun25_INR
                WHEN '2025-07' THEN c.Jul25_INR WHEN '2025-08' THEN c.Aug25_INR
                WHEN '2025-09' THEN c.Sep25_INR WHEN '2025-10' THEN c.Oct25_INR
                WHEN '2025-11' THEN c.Nov25_INR WHEN '2025-12' THEN c.Dec25_INR
                WHEN '2026-01' THEN c.Jan26_INR WHEN '2026-02' THEN c.Feb26_INR
                WHEN '2026-03' THEN c.Mar26_INR END) IS NOT NULL;
    PRINT 'Migrated invoices to long format.';
END
ELSE
    PRINT 'Long-format table already populated; skipping data migration.';

-- 3. Drop the long-format view if it exists; we will recreate later
IF OBJECT_ID('dbo.vw_ContractorMonthlyINR','V') IS NOT NULL
    DROP VIEW dbo.vw_ContractorMonthlyINR;

-- 4. Drop the 30 wide columns from Contractors --------
DECLARE @drop NVARCHAR(MAX) = N'';
SELECT @drop = @drop + 'ALTER TABLE dbo.Contractors DROP COLUMN ' + QUOTENAME(c.name) + ';' + CHAR(13)
FROM sys.columns c
JOIN sys.tables  t ON t.object_id = c.object_id
WHERE t.name = 'Contractors'
  AND (c.name LIKE '%[_]Inv' OR c.name LIKE '%[_]INR');

IF LEN(@drop) > 0
BEGIN
    PRINT 'Dropping wide invoice columns:';
    PRINT @drop;
    EXEC sp_executesql @drop;
END
ELSE
    PRINT 'Wide invoice columns already dropped.';

-- 5. Recreate the dashboard view, now backed by long table
EXEC('
CREATE VIEW dbo.vw_ContractorMonthlyINR AS
SELECT c.HRMID, c.[Name], c.VendorID, c.EntityID,
       i.MonthKey,
       i.InvoiceAmount,
       INR = i.INRAmount,
       -- Display label, e.g. ''Jan-25''
       MonthLabel =
           SUBSTRING(DATENAME(MONTH, CAST(i.MonthKey + ''-01'' AS DATE)), 1, 3)
           + ''-'' + RIGHT(LEFT(i.MonthKey, 4), 2)
FROM dbo.ContractorMonthlyInvoice i
JOIN dbo.Contractors c ON c.HRMID = i.HRMID;
');

COMMIT;
PRINT 'Migration 002 complete.';

-- Sanity check ----------------------------------------
SELECT
    InvoiceRows = (SELECT COUNT(*) FROM dbo.ContractorMonthlyInvoice),
    DistinctMonths = (SELECT COUNT(DISTINCT MonthKey) FROM dbo.ContractorMonthlyInvoice),
    Contractors = (SELECT COUNT(*) FROM dbo.Contractors),
    WideColsRemaining = (SELECT COUNT(*) FROM sys.columns c
                         JOIN sys.tables t ON t.object_id = c.object_id
                         WHERE t.name = 'Contractors'
                           AND (c.name LIKE '%[_]Inv' OR c.name LIKE '%[_]INR'));
