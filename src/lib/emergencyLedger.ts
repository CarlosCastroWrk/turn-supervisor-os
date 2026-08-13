// Last-resort net under the field ledger. localStorage is capped (~5MB in
// Safari) and hit its wall mid-walk on Aug 12 — taps silently stopped saving.
// The ledger is compressed now, but if a save EVER fails again the full plain
// JSON is stashed here in IndexedDB (hundreds of MB of room) and adopted back
// on the next app open, so a refused save never again means a lost tap.

const DATABASE_NAME = 'turn-supervisor-os:emergency:v1';
const DATABASE_VERSION = 1;
const STORE_NAME = 'ledger';
const RECORD_KEY = 'latest';

export interface EmergencyLedgerRecord {
  readonly id: string;
  readonly json: string;
  readonly savedAt: string;
}

let databasePromise: Promise<IDBDatabase> | undefined;

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Emergency ledger request failed.'));
  });

const transactionComplete = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Emergency ledger transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Emergency ledger transaction was cancelled.'));
  });

const openDatabase = () => {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Emergency ledger storage is unavailable in this browser.'));
  }
  if (databasePromise) return databasePromise;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Emergency ledger storage could not be opened.'));
    request.onblocked = () => reject(new Error('Emergency ledger storage is blocked by another app tab.'));
  });
  databasePromise = pending;
  void pending.catch(() => {
    if (databasePromise === pending) databasePromise = undefined;
  });
  return pending;
};

export const stashEmergencyLedger = async (json: string) => {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const record: EmergencyLedgerRecord = {
    id: RECORD_KEY,
    json,
    savedAt: new Date().toISOString(),
  };
  transaction.objectStore(STORE_NAME).put(record);
  await transactionComplete(transaction);
};

export const readEmergencyLedger = async (): Promise<EmergencyLedgerRecord | undefined> => {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const record = await requestResult<EmergencyLedgerRecord | undefined>(
    transaction.objectStore(STORE_NAME).get(RECORD_KEY),
  );
  await transactionComplete(transaction);
  return record && typeof record.json === 'string' && record.json.length > 0
    ? record
    : undefined;
};

export const clearEmergencyLedger = async () => {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
  await transactionComplete(transaction);
};
