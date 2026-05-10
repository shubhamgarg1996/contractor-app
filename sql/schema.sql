-- =====================================================
-- Contractor Tracker — Azure SQL schema
-- Run against your ContractorDB database.
-- =====================================================

IF OBJECT_ID('dbo.AuditLog','U')    IS NOT NULL DROP TABLE dbo.AuditLog;
IF OBJECT_ID('dbo.vw_ContractorMonthlyINR','V') IS NOT NULL DROP VIEW dbo.vw_ContractorMonthlyINR;
IF OBJECT_ID('dbo.Contractors','U') IS NOT NULL DROP TABLE dbo.Contractors;
IF OBJECT_ID('dbo.AppUsers','U')    IS NOT NULL DROP TABLE dbo.AppUsers;
IF OBJECT_ID('dbo.Vendors','U')     IS NOT NULL DROP TABLE dbo.Vendors;
IF OBJECT_ID('dbo.Entities','U')    IS NOT NULL DROP TABLE dbo.Entities;
GO

-- 1. Lookups -------------------------------------------
CREATE TABLE dbo.Vendors (
    VendorID    INT IDENTITY(1,1) PRIMARY KEY,
    VendorName  NVARCHAR(200) NOT NULL UNIQUE,
    IsActive    BIT NOT NULL DEFAULT 1
);

CREATE TABLE dbo.Entities (
    EntityID    INT IDENTITY(1,1) PRIMARY KEY,
    EntityName  NVARCHAR(200) NOT NULL UNIQUE,
    IsActive    BIT NOT NULL DEFAULT 1
);

-- 2. Users + RBAC --------------------------------------
CREATE TABLE dbo.AppUsers (
    UserID       INT IDENTITY(1,1) PRIMARY KEY,
    Email        NVARCHAR(255) NOT NULL UNIQUE,
    DisplayName  NVARCHAR(200),
    [Role]       NVARCHAR(20) NOT NULL
        CHECK ([Role] IN ('Admin','FinanceSPOC','Recruiter','Viewer')),
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedAt    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- 3. Main contractor table (wide format) ---------------
CREATE TABLE dbo.Contractors (
    HRMID                       NVARCHAR(50)  NOT NULL PRIMARY KEY,
    [Name]                      NVARCHAR(200) NOT NULL,
    VendorID                    INT NULL REFERENCES dbo.Vendors(VendorID),
    [Status]                    NVARCHAR(50)  NULL,
    EntityID                    INT NULL REFERENCES dbo.Entities(EntityID),
    FinanceSPOC                 NVARCHAR(200) NULL,
    DateOfJoining               DATE NULL,
    ExitDate                    DATE NULL,
    Currency                    NVARCHAR(10)  NULL,
    Payment                     DECIMAL(18,2) NULL,
    PaymentFrequency            NVARCHAR(20)  NULL
        CHECK (PaymentFrequency IN ('Hourly','Monthly','PerDay') OR PaymentFrequency IS NULL),
    PaymentTerms                NVARCHAR(200) NULL,
    Recruiter                   NVARCHAR(200) NULL,
    LastRenewalEffectiveFrom    DATE NULL,
    ContractEndDate             DATE NULL,
    MonthlyApproxINR            DECIMAL(18,2) NULL,
    AnnualApproxINR             DECIMAL(18,2) NULL,
    Remarks                     NVARCHAR(MAX) NULL,

    Jan25_Inv DECIMAL(18,2) NULL, Jan25_INR DECIMAL(18,2) NULL,
    Feb25_Inv DECIMAL(18,2) NULL, Feb25_INR DECIMAL(18,2) NULL,
    Mar25_Inv DECIMAL(18,2) NULL, Mar25_INR DECIMAL(18,2) NULL,
    Apr25_Inv DECIMAL(18,2) NULL, Apr25_INR DECIMAL(18,2) NULL,
    May25_Inv DECIMAL(18,2) NULL, May25_INR DECIMAL(18,2) NULL,
    Jun25_Inv DECIMAL(18,2) NULL, Jun25_INR DECIMAL(18,2) NULL,
    Jul25_Inv DECIMAL(18,2) NULL, Jul25_INR DECIMAL(18,2) NULL,
    Aug25_Inv DECIMAL(18,2) NULL, Aug25_INR DECIMAL(18,2) NULL,
    Sep25_Inv DECIMAL(18,2) NULL, Sep25_INR DECIMAL(18,2) NULL,
    Oct25_Inv DECIMAL(18,2) NULL, Oct25_INR DECIMAL(18,2) NULL,
    Nov25_Inv DECIMAL(18,2) NULL, Nov25_INR DECIMAL(18,2) NULL,
    Dec25_Inv DECIMAL(18,2) NULL, Dec25_INR DECIMAL(18,2) NULL,
    Jan26_Inv DECIMAL(18,2) NULL, Jan26_INR DECIMAL(18,2) NULL,
    Feb26_Inv DECIMAL(18,2) NULL, Feb26_INR DECIMAL(18,2) NULL,
    Mar26_Inv DECIMAL(18,2) NULL, Mar26_INR DECIMAL(18,2) NULL,

    CreatedAt   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CreatedBy   NVARCHAR(255) NULL,
    UpdatedAt   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy   NVARCHAR(255) NULL
);

CREATE INDEX IX_Contractors_VendorID         ON dbo.Contractors(VendorID);
CREATE INDEX IX_Contractors_EntityID         ON dbo.Contractors(EntityID);
CREATE INDEX IX_Contractors_Status           ON dbo.Contractors([Status]);
CREATE INDEX IX_Contractors_ContractEndDate  ON dbo.Contractors(ContractEndDate);
GO

-- 4. Audit log -----------------------------------------
CREATE TABLE dbo.AuditLog (
    AuditID         BIGINT IDENTITY(1,1) PRIMARY KEY,
    HRMID           NVARCHAR(50) NOT NULL,
    [Action]        NVARCHAR(20) NOT NULL CHECK ([Action] IN ('INSERT','UPDATE','DELETE')),
    ChangedColumn   NVARCHAR(100) NULL,
    OldValue        NVARCHAR(MAX) NULL,
    NewValue        NVARCHAR(MAX) NULL,
    ChangedBy       NVARCHAR(255) NULL,
    ChangedAt       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_AuditLog_HRMID_ChangedAt ON dbo.AuditLog(HRMID, ChangedAt DESC);
GO

-- 5. Long-format view for dashboard --------------------
CREATE VIEW dbo.vw_ContractorMonthlyINR AS
SELECT c.HRMID, c.[Name], c.VendorID, c.EntityID, m.MonthLabel AS [Month],
       INR =
        CASE m.MonthLabel
            WHEN 'Jan-25' THEN c.Jan25_INR WHEN 'Feb-25' THEN c.Feb25_INR
            WHEN 'Mar-25' THEN c.Mar25_INR WHEN 'Apr-25' THEN c.Apr25_INR
            WHEN 'May-25' THEN c.May25_INR WHEN 'Jun-25' THEN c.Jun25_INR
            WHEN 'Jul-25' THEN c.Jul25_INR WHEN 'Aug-25' THEN c.Aug25_INR
            WHEN 'Sep-25' THEN c.Sep25_INR WHEN 'Oct-25' THEN c.Oct25_INR
            WHEN 'Nov-25' THEN c.Nov25_INR WHEN 'Dec-25' THEN c.Dec25_INR
            WHEN 'Jan-26' THEN c.Jan26_INR WHEN 'Feb-26' THEN c.Feb26_INR
            WHEN 'Mar-26' THEN c.Mar26_INR
        END
FROM dbo.Contractors c
CROSS JOIN (VALUES
 ('Jan-25'),('Feb-25'),('Mar-25'),('Apr-25'),('May-25'),('Jun-25'),
 ('Jul-25'),('Aug-25'),('Sep-25'),('Oct-25'),('Nov-25'),('Dec-25'),
 ('Jan-26'),('Feb-26'),('Mar-26')) m(MonthLabel);
GO

-- 6. Seed lookups (edit to taste) ----------------------
INSERT INTO dbo.Vendors  (VendorName) VALUES
    (N'Randstad'), (N'TeamLease'), (N'Adecco'), (N'Manpower'), (N'Direct hire');

INSERT INTO dbo.Entities (EntityName) VALUES
    (N'Celebal Technologies Pvt Ltd'),
    (N'Celebal Technologies Inc (US)'),
    (N'Celebal Technologies Pte (SG)');
GO
