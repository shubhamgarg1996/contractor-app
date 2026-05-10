-- =====================================================
-- 001_add_password_columns.sql
-- Adds username/password authentication to dbo.AppUsers.
-- Idempotent — safe to run multiple times.
-- =====================================================

IF COL_LENGTH('dbo.AppUsers', 'PasswordHash') IS NULL
    ALTER TABLE dbo.AppUsers ADD PasswordHash NVARCHAR(255) NULL;

IF COL_LENGTH('dbo.AppUsers', 'MustChangePassword') IS NULL
    ALTER TABLE dbo.AppUsers ADD MustChangePassword BIT NOT NULL DEFAULT 1;

IF COL_LENGTH('dbo.AppUsers', 'LastLogin') IS NULL
    ALTER TABLE dbo.AppUsers ADD LastLogin DATETIME2 NULL;

IF COL_LENGTH('dbo.AppUsers', 'FailedAttempts') IS NULL
    ALTER TABLE dbo.AppUsers ADD FailedAttempts INT NOT NULL DEFAULT 0;

IF COL_LENGTH('dbo.AppUsers', 'LockedUntil') IS NULL
    ALTER TABLE dbo.AppUsers ADD LockedUntil DATETIME2 NULL;
GO

-- Sanity check
SELECT 'AppUsers ready' AS Status,
       COL_LENGTH('dbo.AppUsers', 'PasswordHash')       AS HasPasswordHash,
       COL_LENGTH('dbo.AppUsers', 'MustChangePassword') AS HasMustChange,
       COL_LENGTH('dbo.AppUsers', 'LastLogin')          AS HasLastLogin;
GO
