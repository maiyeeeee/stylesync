import { API_URL, apiFetch } from "./sessionApi"

// Keep these unchanged to preserve existing queued records.
const DATABASE_NAME = "stylesync-emergency"
const DATABASE_VERSION = 1
const STORE_NAME = "pending-records"

let activeSync = null

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

        request.onupgradeneeded = () => {
            const database = request.result

            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, {
                    keyPath: "offline_id",
                })

                store.createIndex("sync_status", "sync_status")
                store.createIndex("recorded_at", "recorded_at")
            }
        }

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

function createOfflineId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID()
    }

    return `OFF-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function withStore(mode, callback) {
    const database = await openDatabase()

    return new Promise((resolve, reject) => {
        let value
        let callbackError

        const transaction = database.transaction(STORE_NAME, mode)

        transaction.oncomplete = () => {
            database.close()
            resolve(value)
        }

        transaction.onabort = () => {
            database.close()

            reject(
                callbackError ||
                    transaction.error ||
                    new Error("Unable to save local emergency data."),
            )
        }

        try {
            callback(transaction.objectStore(STORE_NAME), (result) => {
                value = result
            })
        } catch (error) {
            callbackError = error
            transaction.abort()
        }
    })
}

export async function queueEmergencyRecord(record_type, payload) {
    const record = {
        offline_id: createOfflineId(),
        record_type,
        recorded_at: new Date().toISOString(),
        payload,
        sync_status: "Pending",
        synced_at: null,
        error_message: "",
    }

    await withStore("readwrite", (store) => store.put(record))

    return record
}

export async function listEmergencyRecords() {
    const records = await withStore("readonly", (store, resolve) => {
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result)
    })

    return records.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
}

export async function updateEmergencyRecord(offline_id, updates) {
    await withStore("readwrite", (store) => {
        const request = store.get(offline_id)

        request.onsuccess = () => {
            if (request.result) {
                store.put({
                    ...request.result,
                    ...updates,
                })
            }
        }
    })
}

export async function removeEmergencyRecord(offline_id) {
    await withStore("readwrite", (store) => {
        store.delete(offline_id)
    })
}

export async function clearSyncedEmergencyRecords() {
    // Remove only synced copies. Keep every unsynced record.
    await withStore("readwrite", (store) => {
        const request = store.openCursor()

        request.onsuccess = () => {
            const cursor = request.result

            if (!cursor) return

            if (cursor.value.sync_status === "Synced") {
                cursor.delete()
            }

            cursor.continue()
        }
    })
}

async function sendRecord(record) {
    const payload = {
        ...record.payload,
        offline_id: record.offline_id,
    }

    let url

    if (record.record_type === "appointment") {
        url = `${API_URL}/appointments`
    }

    if (record.record_type === "sale") {
        url = `${API_URL}/transactions`
    }

    if (record.record_type === "inventory") {
        url = `${API_URL}/inventory/${encodeURIComponent(payload.item_id)}/adjust`
    }

    if (!url) {
        throw new Error("Unsupported emergency record type")
    }

    const response = await apiFetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!data || data.error || data.id == null) {
        throw new Error(
            "The server did not confirm this record. Retry sync using the same offline ID.",
        )
    }

    return data
}

async function runSync() {
    if (!navigator.onLine) {
        throw new Error("You are offline. Emergency records remain saved on this device.")
    }

    const records = await listEmergencyRecords()
    const results = []

    for (const record of records.filter((item) => item.sync_status !== "Synced")) {
        if (!navigator.onLine) break

        await updateEmergencyRecord(record.offline_id, {
            sync_status: "Syncing",
            error_message: "",
        })

        try {
            const data = await sendRecord(record)

            await updateEmergencyRecord(record.offline_id, {
                sync_status: "Synced",
                synced_at: new Date().toISOString(),
                error_message: "",
                server_id: data.id,
            })

            results.push({
                offline_id: record.offline_id,
                status: "Synced",
            })
        } catch (error) {
            const authenticationFailed = error.status === 401 || error.status === 403

            const disconnected = !navigator.onLine || error instanceof TypeError

            const status =
                error.status === 409
                    ? "Needs Review"
                    : authenticationFailed || disconnected
                      ? record.sync_status === "Needs Review"
                          ? "Needs Review"
                          : "Pending"
                      : "Failed"

            const message =
                error.status === 401
                    ? "Please log in again, then retry sync. This record remains saved locally."
                    : error.status === 403
                      ? `${error.message} This record remains saved locally.`
                      : error.message ||
                        "Synchronization failed. This record remains saved locally."

            await updateEmergencyRecord(record.offline_id, {
                sync_status: status,
                error_message: message,
            })

            results.push({
                offline_id: record.offline_id,
                status,
                error: message,
            })

            // Stop without losing the remaining queue.
            if (authenticationFailed || disconnected) {
                break
            }
        }
    }

    return results
}

// Older callers may pass API_URL; the shared configuration is used.
export function syncEmergencyRecords() {
    if (activeSync) {
        return activeSync
    }

    activeSync = runSync().finally(() => {
        activeSync = null
    })

    return activeSync
}
