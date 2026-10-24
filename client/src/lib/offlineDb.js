
import { API_URL, apiFetch } from "./sessionApi"

// Preserve these identifiers: changing them would hide existing queued records.
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
                const store = database.createObjectStore(STORE_NAME, { keyPath: "offline_id" })
                store.createIndex("sync_status", "sync_status")
                store.createIndex("recorded_at", "recorded_at")
            }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

function createOfflineId() {
    return globalThis.crypto?.randomUUID?.() || `OFF-${Date.now()}-${Math.random().toString(16).slice(2)}`
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
            reject(callbackError || transaction.error || new Error("Unable to save local emergency data."))
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
    // Every emergency sale must have a valid customer mobile number.
    // Normalize +639XXXXXXXXX and 639XXXXXXXXX to 09XXXXXXXXX.
    if (record_type === "sale") {
        const rawPhone = String(payload?.customer_contact || "")
            .replace(/[\s()-]/g, "")

        const phone = /^\+639\d{9}$/.test(rawPhone)
            ? `0${rawPhone.slice(3)}`
            : /^639\d{9}$/.test(rawPhone)
                ? `0${rawPhone.slice(2)}`
                : rawPhone

        if (!/^09\d{9}$/.test(phone)) {
            throw new Error(
                "A valid customer mobile number (09XXXXXXXXX) is required for every emergency sale."
            )
        }

        payload = { ...payload, customer_contact: phone }
    }

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

export async function getEmergencyRecord(offline_id) {
    return withStore("readonly", (store, resolve) => {
        const request = store.get(offline_id)
        request.onsuccess = () => resolve(request.result || null)
    })
}

// A POS confirmation must be matched against an actual server row before updating local status.
export async function reconcileEmergencySale(offline_id, serverTransaction) {
    const record = await getEmergencyRecord(offline_id)

    if (
        !record ||
        record.record_type !== "sale" ||
        record.payload?.sale_type !== "Service"
    ) {
        throw new Error("The original emergency service sale was not found on this device.")
    }

    if (
        String(serverTransaction?.offline_id || "") !== String(offline_id) ||
        !Number.isSafeInteger(Number(serverTransaction?.transaction_id)) ||
        Number(serverTransaction.transaction_id) <= 0
    ) {
        throw new Error("The server transaction does not match the original offline ID.")
    }

    await updateEmergencyRecord(offline_id, {
        sync_status: "Synced",
        reconciliation_status: "Reconciled",
        server_id: Number(serverTransaction.transaction_id),
        synced_at: new Date().toISOString(),
        error_message: "",
    })
}

export async function updateEmergencyRecord(offline_id, updates) {
    await withStore("readwrite", (store) => {
        const request = store.get(offline_id)
        request.onsuccess = () => {
            if (request.result) {
                store.put({ ...request.result, ...updates })
            }
        }
    })
}

export async function removeEmergencyRecord(offline_id) {
    await withStore("readwrite", (store) => store.delete(offline_id))
}

export async function clearSyncedEmergencyRecords() {
    await withStore("readwrite", (store) => {
        const request = store.openCursor()
        request.onsuccess = () => {
            const cursor = request.result
            if (!cursor) return

            if (
                cursor.value.sync_status === "Synced" &&
                cursor.value.reconciliation_status !== "Reconciled"
            ) {
                cursor.delete()
            }

            cursor.continue()
        }
    })
}

async function sendRecord(record) {
    const payload = { ...record.payload, offline_id: record.offline_id }
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok || !data || data.error || data.id == null) {
        const error = new Error(
            data?.error || "The server did not confirm this record. Retry using the same offline ID."
        )
        error.status = response.status
        throw error
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

        // Service checkout MUST be reconciled online by staff.
        // The backend intentionally rejects offline_queued current services
        // and requires authoritative promotion/loyalty quotes.
        // Never silently charge base price.
        if (
            record.record_type === "sale" &&
            (record.payload?.sale_type || "Service") === "Service"
        ) {
            const message =
                "Service sale requires online POS review of the current promotion, loyalty reward, and amount collected. Do not re-enter it without checking for an existing transaction first. This local record has NOT been posted to Reports."

            await updateEmergencyRecord(record.offline_id, {
                sync_status: "Needs Review",
                error_message: message,
            })

            results.push({
                offline_id: record.offline_id,
                status: "Needs Review",
                error: message,
            })

            continue
        }

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
            const authenticationFailed =
                error.status === 401 || error.status === 403

            const disconnected =
                !navigator.onLine || error instanceof TypeError

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
                        : error.message || "Synchronization failed. This record remains saved locally."

            await updateEmergencyRecord(record.offline_id, {
                sync_status: status,
                error_message: message,
            })

            results.push({
                offline_id: record.offline_id,
                status,
                error: message,
            })

            if (authenticationFailed || disconnected) break
        }
    }

    return results
}

export function syncEmergencyRecords() {
    if (activeSync) return activeSync

    activeSync = runSync().finally(() => {
        activeSync = null
    })

    return activeSync
}
