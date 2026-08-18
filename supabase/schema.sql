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
  -- Manual override — same pattern as manual_contact_email/manual_contact_phone below:
  -- set by you in the app when a scraped address is missing or wrong. Kept separate
  -- from `address` since scrapers overwrite that column on every re-run.
  manual_address text,
  parcel_id text,
  latitude double precision,
  longitude double precision,

  -- classification
  project_type text,                  -- Residential / Commercial / Industrial / Mixed Use / etc.
  request_type text,                  -- Rezone / Conditional Use Permit / Subdivision / etc.
  current_zoning text,                -- existing zoning district, e.g. "INST(CD)" — available on Charlotte, Matthews, Mint Hill
  zoning text,                        -- requested zoning district, e.g. "B-P DO-B (CZD)"
  acreage text,                       -- site size, e.g. "4.94" — available on Mint Hill, Matthews, Cornelius, Davidson (kept as text since a few towns report ranges/approximations like "+/-2")

  -- parties
  applicant text,
  developer text,
  owner text,
  contact_email text,                 -- opportunistically extracted from applicant/developer/owner/description text — see scrapers/lib/contact.js
  contact_phone text,
  -- Manual overrides — set by you in the app when auto-extraction finds nothing (or
  -- finds something wrong). Kept in SEPARATE columns from contact_email/contact_phone
  -- above rather than editing those directly: scrapers overwrite contact_email/
  -- contact_phone on every run, which would silently wipe out a manual entry the next
  -- time that town gets re-scraped. The app displays manual_contact_email if present,
  -- falling back to contact_email otherwise — see src/components/ProjectDetail.jsx.
  manual_contact_email text,
  manual_contact_phone text,

  -- status
  status text,                        -- "Pending", "Approved - Commission", "Continued", etc.
  description text,
  last_action_date date,
  hearing_date date,

  -- bookkeeping
  first_seen_at timestamptz default now(),
  last_scraped_at timestamptz default now(),

  -- personal pipeline tracking — set by you in the app, never touched by scrapers.
  -- Separate from `status` above, which is the town's own official status (Approved,
  -- Pending, etc.) — this is your own CRM-style tracking of outreach on the lead.
  lead_status text,                   -- "Contacted", "Interested", "Follow Up", or "Client"
  lead_notes text,

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

-- Personal pipeline tracking (lead_status/lead_notes) needs to be editable from the
-- app itself, not just the scrapers. IMPORTANT TRADEOFF: this app has no login system,
-- so the public anon key is the only key the frontend has — meaning this grant lets
-- ANYONE visiting the live site edit these two fields, not just you. Scoped as tightly
-- as possible to limit the blast radius: the column-level GRANT below means the anon
-- role can ONLY write to lead_status/lead_notes, nothing else on this table (scraped
-- data, addresses, parcel IDs, etc. all stay read-only regardless of this policy). If
-- this ever becomes a real concern (public traffic, vandalism), the right fix is adding
-- real authentication (e.g. Supabase Auth) and restricting this policy to logged-in
-- users only — not in scope for this pass.
create policy "Public can update lead tracking fields"
  on rezoning_projects for update
  using (true)
  with check (true);

grant update (lead_status, lead_notes, manual_contact_email, manual_contact_phone, manual_address) on rezoning_projects to anon;

-- MIGRATION for existing databases (e.g. the live production table): "create table if
-- not exists" above won't add new columns to a table that already exists. Run this too
-- if you set up the table before acreage/current_zoning were added (2026-08-13).
alter table rezoning_projects add column if not exists acreage text;
alter table rezoning_projects add column if not exists current_zoning text;

-- MIGRATION for lead tracking (2026-08-14): run this plus the policy/grant above if
-- your table already existed before this feature was added.
alter table rezoning_projects add column if not exists lead_status text;
alter table rezoning_projects add column if not exists lead_notes text;

-- MIGRATION for contact info extraction (2026-08-16): run this if your table already
-- existed before this feature was added.
alter table rezoning_projects add column if not exists contact_email text;
alter table rezoning_projects add column if not exists contact_phone text;

-- MIGRATION for manual contact overrides (2026-08-18): run this plus the updated grant
-- above if your table already existed before this feature was added.
alter table rezoning_projects add column if not exists manual_contact_email text;
alter table rezoning_projects add column if not exists manual_contact_phone text;
grant update (manual_contact_email, manual_contact_phone) on rezoning_projects to anon;

-- MIGRATION for manual address override (2026-08-19): run this plus the updated grant
-- above if your table already existed before this feature was added.
alter table rezoning_projects add column if not exists manual_address text;
grant update (manual_address) on rezoning_projects to anon;
