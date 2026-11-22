import { useEffect, useState } from 'preact/hooks';
import { lastBackupAt, makeBackup, markBackup, restoreBackup, shareOrDownload, type BackupFile } from '../../data/backup.ts';
import { loadSettings, say } from '../state.ts';

export function BackupCard() {
  const [withRec, setWithRec] = useState(false);
  const [last, setLast] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => void lastBackupAt().then(setLast), []);
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  return (
    <div class="card">
      <h2>Backup & restore</h2>
      <p class="small">
        One file with your progress, settings and career notes{withRec ? ' and recordings' : ''}. It goes only where you
        send it (e.g. Files or iCloud Drive).
      </p>
      {days === null || days >= 7 ? <div class="notice warn small">{days === null ? 'No backup yet.' : `Last backup ${days} days ago.`} Weekly backups protect you if Safari clears site data.</div> : <p class="small muted">Last backup: {days === 0 ? 'today' : `${days} day(s) ago`}.</p>}
      <label class="row small">
        <input type="checkbox" checked={withRec} onChange={(e) => setWithRec(e.currentTarget.checked)} /> Include my recordings (bigger file)
      </label>
      <div class="row" style={{ marginTop: 8 }}>
        <button
          class="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const b = await makeBackup(withRec);
              await shareOrDownload(`tilawa-backup-${b.created.slice(0, 10)}.json`, 'application/json', JSON.stringify(b));
              await markBackup();
              setLast(Date.now());
            } catch (e) {
              say(`Backup failed: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          Back up now
        </button>
        <label class="btn">
          Restore…
          <input
            type="file"
            accept="application/json,.json"
            class="sr-only"
            onChange={async (e) => {
              const f = e.currentTarget.files?.[0];
              if (!f) return;
              try {
                const r = await restoreBackup(JSON.parse(await f.text()) as BackupFile);
                await loadSettings();
                say(`Restored: ${r.kv} settings, ${r.srs} review cards, ${r.career} career items, ${r.recordings} recordings.`);
              } catch (err) {
                say(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}
