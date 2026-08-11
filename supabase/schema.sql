-- Run this in the Supabase SQL editor to set up the tracker.

create table if not exists rezoning_projects (
  id uuid primary key default gen_random_uuid(),

  -- identity
  name text not null,                 -- e.g. "Mint Hill Festival"
  source text not null,               -- e.g. "charlotte_legistar", "mint_hill_planning"
  source_id text,                     -- the source system's own case/petition number
  source_url text,                    -- link back to the original filing/page

  -- location
  municipality text,                  -- "Charlotte", "Mint Hill", "Matthews", etc.
  address text,
  parcel_id text,
  latitude double precision,
  longitude double precision,

  -- classification
  project_type text,                  -- Residential / Commercial / Industrial / Mixed Use / etc.
  request_type text,                  -- Rezone / Conditional Use Permit / Subdivision / etc.
  zoning text,                        -- requested zoning district, e.g. "B-P DO-B (CZD)"

  -- parties
  applicant text,
  developer text,
  owner text,

  -- status
  status text,                        -- "Pending", "Approved - Commission", "Continued", etc.
  description text,
  last_action_date date,
  hearing_date date,

  -- bookkeeping
  first_seen_at timestamptz default now(),
  last_scraped_at timestamptz default now(),

  unique (source, source_id)
);

create index if not exists idx_rezoning_projects_municipality on rezoning_projects (municipality);
create index if not exists idx_rezoning_projects_type on rezoning_projects (project_type);
create index if not exists idx_rezoning_projects_last_action on rezoning_projects (last_action_date desc);

-- Row Level Security: allow public read-only access (this is public record data anyway).
-- Writes should only happen via the scraper using the service_role key, never the anon key.
alter table rezoning_projects enable row level security;

create policy "Public can read projects"
  on rezoning_projects for select
  using (true);
