# Unit 22 — Connection References API & Encryption

## What This Unit Builds

The `connection_refs` system — named external connection references stored
with AES-256-GCM encryption. The API lets operators create and manage
connection references (e.g., `postgres-warehouse`, `azure-blob-prod`).
Handlers that stub `// TODO(unit-22)` are updated to resolve their
`connectionRef` input at execution time.

**Done looks like:**
- `POST /api/connections` creates a connection ref with `name: "test-smtp"`,
  `type: "smtp"`, and credentials. The `connection_refs` table stores the
  encrypted bytes — `psql` shows `encrypted_config` as binary, not plaintext.
- `GET /api/connections` lists connection refs by name and type (no credentials).
- A step using `"connectionRef": "test-smtp"` in its `inputConfig` — the
  `send-email` handler decrypts the config in memory and uses it, without
  the decrypted value appearing in any log.
- Deleting a connection ref used by a workflow step is blocked with `409`.

---

## Dependencies

- Unit 02 — `connection_refs` table exists.
- Unit 06 — Handler stubs with `// TODO(unit-22)` comments.
- Unit 11 — API server with auth.
- Unit 21 — Secret redaction (`redactPayload`) in place.

---

## Files to Create / Modify

```
packages/api/src/routes/
└── connections/
    ├── index.ts                  # registers connection ref routes
    ├── create.ts                 # POST /api/connections
    ├── list.ts                   # GET /api/connections
    ├── get.ts                    # GET /api/connections/:id
    ├── update.ts                 # PUT /api/connections/:id
    └── delete.ts                 # DELETE /api/connections/:id

packages/api/src/services/
└── connection-service.ts         # DB operations + encrypt/decrypt

packages/handlers/src/
└── connection-resolver.ts        # resolves connectionRef → decrypted config at runtime
```

---

## Encryption Scheme

Use Node.js built-in `crypto` module (no external library needed).

**Algorithm:** AES-256-GCM (authenticated encryption — provides both confidentiality and integrity)

```ts
// ENCRYPTION_KEY env var: 32-byte hex string (256 bits)
// e.g., openssl rand -hex 32

function encrypt(plaintext: string, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  const iv  = crypto.randomBytes(12);           // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();          // 128-bit auth tag

  // Layout: [iv(12)] + [authTag(16)] + [ciphertext]
  return Buffer.concat([iv, authTag, encrypted]);
}

function decrypt(cipherBuffer: Buffer, keyHex: string): string {
  const key      = Buffer.from(keyHex, 'hex');
  const iv       = cipherBuffer.subarray(0, 12);
  const authTag  = cipherBuffer.subarray(12, 28);
  const ciphertext = cipherBuffer.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}
```

The `ENCRYPTION_KEY` is read from env vars (set in `.env.example`, injected
from Azure Key Vault in production).

---

## Routes

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| `POST` | `/api/connections` | ✓ | `operator` | Create a connection ref |
| `GET` | `/api/connections` | ✓ | any | List all (no credentials returned) |
| `GET` | `/api/connections/:id` | ✓ | `operator` | Get one (no credentials returned) |
| `PUT` | `/api/connections/:id` | ✓ | `operator` | Update credentials (re-encrypts) |
| `DELETE` | `/api/connections/:id` | ✓ | `operator` | Delete (blocked if in use) |

**Never return decrypted credentials in any API response.** Responses include
only: `id`, `name`, `type`, `createdAt`, `updatedAt`.

### `POST /api/connections` Body

```ts
{
  name:        string;   // unique, e.g. "postgres-warehouse"
  type:        string;   // "postgres" | "smtp" | "blob" | "http" | ...
  config:      Record<string, unknown>;   // raw credentials (encrypted on write)
}
```

---

## Connection Resolver (`connection-resolver.ts`)

This is the only code path that decrypts credentials. It is called by
handlers at execution time.

```ts
export async function resolveConnection(
  pool:          Pool,
  connectionRef: string,
  encryptionKey: string,
): Promise<Record<string, unknown>> {
  const row = await pool.query(
    'SELECT encrypted_config FROM connection_refs WHERE name = $1',
    [connectionRef],
  );

  if (row.rowCount === 0) {
    throw new Error(`Connection ref "${connectionRef}" not found`);
  }

  const decrypted = decrypt(row.rows[0].encrypted_config, encryptionKey);
  return JSON.parse(decrypted);
}
```

The decrypted config must:
- Never be logged (handlers must not call `ctx.logger.info(config)`).
- Never be included in `output_payload` or `error_message`.
- Exist in memory only for the duration of the handler call.

---

## Updating Handler Stubs

Now that `connection-resolver.ts` exists, update the handler stubs that had
`// TODO(unit-22)` comments:

- `send-email` — resolve SMTP config, use `nodemailer` to send the email.
- `sql-query` — resolve postgres config, execute the query using a temporary pool.
- `blob-to-postgres` — resolve both source blob config and target postgres config.
- `embedding-generator` — resolve OpenAI API key from config.

For each updated handler, ensure:
- The resolved config is never logged.
- The resolved config is not included in the returned output payload.

---

## `DELETE` Safety Check

```sql
-- Block delete if any workflow_steps reference this connection by name
SELECT EXISTS (
  SELECT 1 FROM workflow_steps
  WHERE input_config::text LIKE '%"connectionRef":"' || $name || '"%'
)
```

If references exist, return `409 CONFLICT` with a list of workflow names that use it.

---

## Audit Logging

| Route | Action |
|-------|--------|
| `POST /api/connections` | `connection.create` |
| `PUT /api/connections/:id` | `connection.update` |
| `DELETE /api/connections/:id` | `connection.delete` |

Metadata: `{ name, type }` — never log the config content.

---

## Verification Checklist

- [ ] `POST /api/connections` creates a row. `psql` shows `encrypted_config` as binary (not plaintext).
- [ ] `GET /api/connections` response does not contain any field named `config`,
      `password`, `secret`, or similar.
- [ ] Decrypting the stored `encrypted_config` column with the correct `ENCRYPTION_KEY`
      recovers the original config exactly.
- [ ] Wrong `ENCRYPTION_KEY` → `decrypt()` throws (GCM auth tag verification fails).
- [ ] `DELETE /api/connections/:id` on a ref used by a workflow step → `409` with workflow names.
- [ ] `send-email` handler (if wired to a real SMTP ref) does not log the password.
- [ ] After a step run that uses a connection ref, query `step_logs` — no row contains
      the decrypted credential value.
- [ ] `viewer` role cannot `POST`, `PUT`, or `DELETE` → `403`.
- [ ] `tsc --noEmit` exits 0 on all modified packages.
