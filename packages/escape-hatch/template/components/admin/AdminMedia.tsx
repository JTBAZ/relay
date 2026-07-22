import type { AdminMediaModel } from "@/lib/admin/load-admin";

function statusTone(row: AdminMediaModel["rows"][number]): string {
  if (row.failure_reason || row.ledger_status === "failed") return "fail";
  if (row.private_read_verified) return "verified";
  if (row.public_media_only) return "public";
  return "neutral";
}

export function AdminMedia({ model }: { model: AdminMediaModel }) {
  return (
    <div className="admin-panel">
      <section className="admin-banner admin-banner--info" aria-live="polite">
        {model.honesty.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="small muted">
          Ledger present: {model.ledger_present ? "yes" : "no"} · production_safe:
          false
        </p>
      </section>

      {model.rows.length === 0 ? (
        <p className="muted">No media accounted in this kit yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Media inventory</caption>
            <thead>
              <tr>
                <th scope="col">Media</th>
                <th scope="col">Access</th>
                <th scope="col">Ledger</th>
                <th scope="col">Private verified</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.media_id} data-tone={statusTone(row)}>
                  <td>
                    <span className="mono">{row.media_id}</span>
                    {row.mime_type ? (
                      <span className="muted small block">{row.mime_type}</span>
                    ) : null}
                  </td>
                  <td>{row.access_class}</td>
                  <td>
                    {row.ledger_status ?? (
                      <span className="muted">n/a</span>
                    )}
                  </td>
                  <td>
                    {row.public_media_only ? (
                      <span className="admin-pill admin-pill--warn">
                        public/media only
                      </span>
                    ) : row.private_read_verified ? (
                      <span className="admin-pill admin-pill--ok">verified</span>
                    ) : (
                      <span className="admin-pill admin-pill--warn">
                        not verified
                      </span>
                    )}
                  </td>
                  <td className="small">
                    {row.failure_reason ??
                      (row.content_path ? (
                        <span className="mono muted">{row.content_path}</span>
                      ) : (
                        "—"
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
