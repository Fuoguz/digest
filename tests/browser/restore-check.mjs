import assert from 'node:assert/strict';

export function assertRestoredStores(backup, recovered) {
  // Recovery deliberately discards in-flight request IDs; all learning fields must match.
  assert.deepEqual(Object.keys(recovered.stores).sort(),Object.keys(backup.stores).sort());
  for(const name of Object.keys(backup.stores).filter(n=>n!=='activities')){
    const expected=structuredClone(backup.stores[name]);
    for(const record of expected){
      if(name==='documents')record.activeAnalysisRequestId=null;
      if(name==='attempts')record.activeRequestId=null;
    }
    assert.deepEqual(recovered.stores[name],expected,name);
  }
  for(const activity of backup.stores.activities)assert.ok(recovered.stores.activities.some(a=>JSON.stringify(a)===JSON.stringify(activity)),'old activity retained');
}
