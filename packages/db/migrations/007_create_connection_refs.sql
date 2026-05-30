CREATE TABLE connection_refs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,     -- e.g. "postgres-warehouse"
  type              TEXT NOT NULL,            -- e.g. "postgres" | "smtp" | "blob"
  encrypted_config  BYTEA NOT NULL,           -- AES-256-GCM encrypted JSON
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
