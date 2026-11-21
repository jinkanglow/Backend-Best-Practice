/** Database-side evidence. A pending client promise is never sufficient proof of a lock. */
export async function sessionIdentity(engine, db) {
  const result = await db.query(engine === 'postgres' ? 'SELECT pg_backend_pid() AS session_id' : 'SELECT CONNECTION_ID() AS session_id');
  const rows = engine === 'postgres' ? result.rows : result[0];
  const id = Number(rows?.[0]?.session_id);
  if (!Number.isSafeInteger(id) || id <= 0) throw Error('Unable to establish database session identity');
  return id;
}
export async function inspectLockWait(engine, observer, waitingId, holdingId) {
  if (!Number.isSafeInteger(waitingId) || waitingId<=0 || !Number.isSafeInteger(holdingId) || holdingId<=0 || waitingId === holdingId) throw Error('Invalid lock session identities');
  if (engine === 'postgres') {
    const result = await observer.query(`SELECT a.pid AS waiter_id, b.pid AS blocker_id, a.wait_event_type AS wait_type
      FROM pg_stat_activity a JOIN LATERAL unnest(pg_blocking_pids(a.pid)) AS p(pid) ON true
      JOIN pg_stat_activity b ON b.pid = p.pid
      WHERE a.pid = $1 AND b.pid = $2`, [waitingId, holdingId]);
    const matches = result.rows ?? [];
    return {observed: matches.some(x => Number(x.waiter_id) === waitingId && Number(x.blocker_id) === holdingId && x.wait_type === 'Lock'), source:'pg_stat_activity + pg_blocking_pids', sample_count:matches.length};
  }
  if (engine === 'mysql') {
    const result = await observer.query(`SELECT rt.PROCESSLIST_ID AS waiter_id, bt.PROCESSLIST_ID AS blocker_id
      FROM performance_schema.data_lock_waits w
      JOIN performance_schema.threads rt ON rt.THREAD_ID = w.REQUESTING_THREAD_ID
      JOIN performance_schema.threads bt ON bt.THREAD_ID = w.BLOCKING_THREAD_ID
      WHERE rt.PROCESSLIST_ID = ? AND bt.PROCESSLIST_ID = ?`, [waitingId, holdingId]);
    const matches = result[0] ?? [];
    return {observed: matches.some(x => Number(x.waiter_id) === waitingId && Number(x.blocker_id) === holdingId), source:'performance_schema.data_lock_waits', sample_count:matches.length};
  }
  throw Error('Unsupported database engine');
}
