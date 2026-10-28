<#
  scripts/pg-local.ps1 — a real PostgreSQL 17 instance for Radif development.

  Why this exists: the app needs a real PostgreSQL server (not SQLite, not an
  in-memory fake). This machine has no system PostgreSQL and no running Docker
  daemon, so we run PostgreSQL from its portable Windows binaries inside
  .work/ (git-ignored). Anyone with Docker can use `docker compose up -d`
  instead — both expose the same DATABASE_URL.

  Usage:
    pwsh scripts/pg-local.ps1 init      # one time: download (if needed), initdb, create DBs
    pwsh scripts/pg-local.ps1 start     # start the server on 127.0.0.1:5433
    pwsh scripts/pg-local.ps1 stop      # stop it
    pwsh scripts/pg-local.ps1 status    # is it accepting connections?
    pwsh scripts/pg-local.ps1 psql      # interactive psql against the app DB
#>
param([Parameter(Position = 0)][ValidateSet('init', 'start', 'stop', 'status', 'psql')][string]$Action = 'status')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$zip = Join-Path $root '.work\pg.zip'
$pg = Join-Path $root '.work\pg\pgsql'
$bin = Join-Path $pg 'bin'
$data = Join-Path $root '.work\pgdata'
$log = Join-Path $root '.work\pg.log'
$port = 5433
$user = 'radif'
$pass = 'radif_dev'

function Ensure-Binaries {
  if (Test-Path (Join-Path $bin 'initdb.exe')) { return }
  New-Item -ItemType Directory -Force -Path (Join-Path $root '.work') | Out-Null
  if (-not (Test-Path $zip)) {
    Write-Host 'Downloading PostgreSQL 17.6 portable binaries (~330 MB)...'
    curl.exe -L --retry 3 -o $zip 'https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip'
  }
  Write-Host 'Extracting bin/lib/share...'
  New-Item -ItemType Directory -Force -Path (Join-Path $root '.work\pg') | Out-Null
  tar -xf $zip -C (Join-Path $root '.work\pg') pgsql/bin pgsql/lib pgsql/share
}

switch ($Action) {
  'init' {
    Ensure-Binaries
    if (Test-Path (Join-Path $data 'PG_VERSION')) {
      Write-Host "Cluster already initialised at $data"
    }
    else {
      $pwfile = Join-Path $root '.work\.pgpass.tmp'
      Set-Content -Path $pwfile -Value $pass -NoNewline -Encoding ascii
      & (Join-Path $bin 'initdb.exe') -D $data -U $user -A scram-sha-256 --pwfile=$pwfile -E UTF8 --locale=C
      Remove-Item $pwfile -Force
    }
    & $PSCommandPath start
    $env:PGPASSWORD = $pass
    foreach ($db in @('radif', 'radif_test')) {
      $exists = & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p $port -U $user -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'"
      if ($exists -ne '1') { & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p $port -U $user $db; Write-Host "created database $db" }
      else { Write-Host "database $db already exists" }
    }
  }
  'start' {
    Ensure-Binaries
    $ready = & (Join-Path $bin 'pg_ctl.exe') -D $data status 2>&1
    if ($ready -match 'server is running') { Write-Host 'Already running.'; break }
    & (Join-Path $bin 'pg_ctl.exe') -D $data -l $log -o "-p $port -c listen_addresses=127.0.0.1" -w start
    Write-Host "PostgreSQL listening on 127.0.0.1:$port (db radif, db radif_test, user $user)"
  }
  'stop' {
    if (Test-Path (Join-Path $bin 'pg_ctl.exe')) { & (Join-Path $bin 'pg_ctl.exe') -D $data -m fast -w stop }
  }
  'status' {
    if (-not (Test-Path (Join-Path $bin 'pg_ctl.exe'))) { Write-Host 'binaries missing — run init'; break }
    $env:PGPASSWORD = $pass
    $out = & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p $port -U $user -d radif -tAc 'select version()' 2>&1
    Write-Host "status: $out"
  }
  'psql' {
    $env:PGPASSWORD = $pass
    & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p $port -U $user -d radif
  }
}
