import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { API_URL, apiFetch, readSession } from "../lib/sessionApi"

const inputClass = "border border-gray-300 rounded-xl px-4 py-3 w-full"

const primaryClass =
    "bg-purple-700 hover:bg-purple-800 text-white px-5 py-3 rounded-xl font-semibold disabled:opacity-50"

export default function AdminAccounts() {
    const [currentUser, setCurrentUser] = useState(null)
    const [users, setUsers] = useState([])
    const [invitations, setInvitations] = useState([])
    const [inviteEmail, setInviteEmail] = useState("")
    const [invitePassword, setInvitePassword] = useState("")
    const [inviteLink, setInviteLink] = useState("")
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [loadError, setLoadError] = useState("")
    const [message, setMessage] = useState("")

    const loadAccounts = useCallback(async () => {
        setLoading(true)
        setLoadError("")

        try {
            const session = await readSession()
            setCurrentUser(session.user)

            if (session.user?.role !== "owner") return

            const [accountData, invitationData] = await Promise.all([
                apiFetch(`${API_URL}/auth/users`).then((res) => res.json()),
                apiFetch(`${API_URL}/auth/owner-invitations`).then((res) => res.json()),
            ])

            if (!Array.isArray(accountData) || !Array.isArray(invitationData)) {
                throw new Error("Invalid accounts response.")
            }

            setUsers(accountData)
            setInvitations(invitationData)
        } catch (err) {
            setLoadError(err.message || "Unable to load accounts.")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadAccounts()
    }, [loadAccounts])

    async function mutate(path, options, onSuccess) {
        if (busy) return

        setBusy(true)
        setError("")
        setMessage("")

        try {
            const response = await apiFetch(`${API_URL}/auth${path}`, options)

            const data = await response.json()

            if (onSuccess) onSuccess(data)

            setMessage(data.message || "Saved successfully.")
            await loadAccounts()
        } catch (err) {
            setError(err.message || "Unable to save the change.")
        } finally {
            setBusy(false)
        }
    }

    const json = (method, body) => ({
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })

    async function createInvitation(event) {
        event.preventDefault()
        setInviteLink("")

        await mutate(
            "/owner-invitations",
            json("POST", {
                email: inviteEmail,
                currentPassword: invitePassword,
            }),
            (data) => {
                setInviteLink(`${window.location.origin}/admin-register#owner-invite=${data.token}`)
                setInviteEmail("")
            },
        )

        setInvitePassword("")
    }

    function approval(user, decision) {
        const action = decision === "approve" ? "Approve" : "Reject"

        if (!window.confirm(`${action} the staff registration for ${user.username}?`)) {
            return
        }

        return mutate(`/users/${user.user_id}/approval`, json("PATCH", { decision }))
    }

    function remove(user) {
        const warning =
            user.role === "owner"
                ? "Only remove an old/testing owner after the real owner has signed in successfully. "
                : ""

        if (!window.confirm(`${warning}Permanently delete account ${user.username}?`)) {
            return
        }

        return mutate(`/users/${user.user_id}`, {
            method: "DELETE",
        })
    }

    function revoke(invitation) {
        if (!window.confirm(`Revoke the owner invitation for ${invitation.email}?`)) {
            return
        }

        return mutate(`/owner-invitations/${invitation.invitation_id}`, { method: "DELETE" })
    }

    async function copyInvitation() {
        try {
            await navigator.clipboard.writeText(inviteLink)
            setMessage("Invitation copied. Share it privately with the real owner.")
        } catch {
            setError("Select the invitation link and press Ctrl+C to copy it manually.")
        }
    }

    function date(value) {
        if (!value) return "—"
        return new Date(value).toLocaleDateString("en-PH")
    }

    const pending = users.filter((user) => user.account_status === "Pending")

    if (loading && !currentUser) {
        return <p role="status">Loading account management…</p>
    }

    if (!currentUser && loadError) {
        return (
            <div role="alert">
                {loadError} <button onClick={loadAccounts}>Retry</button>
            </div>
        )
    }

    if (currentUser?.role !== "owner") {
        return (
            <div className="bg-white rounded-2xl p-8 text-center shadow">
                <h2 className="text-2xl text-red-600 font-bold">Access Denied</h2>

                <p className="my-4">
                    Only the owner can manage accounts and approve registrations.
                </p>

                <Link to="/admin" className="text-purple-700">
                    Back to Dashboard
                </Link>
            </div>
        )
    }

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                    <h2 className="text-4xl font-bold text-purple-800 mb-2">Account Management</h2>

                    <p className="text-gray-600">
                        Approve staff requests, manage accounts, and invite the real salon owner.
                    </p>
                </div>

                <button
                    className="text-purple-700 font-semibold"
                    disabled={busy || loading}
                    onClick={loadAccounts}
                >
                    Refresh
                </button>
            </div>

            {error && (
                <p role="alert" className="bg-red-100 text-red-700 rounded-xl p-4 mb-4">
                    {error}
                </p>
            )}

            {loadError && (
                <p role="alert" className="bg-red-100 text-red-700 rounded-xl p-4 mb-4">
                    {loadError}{" "}
                    <button onClick={loadAccounts} className="underline">
                        Retry
                    </button>
                </p>
            )}

            {message && (
                <p role="status" className="bg-green-50 text-green-800 rounded-xl p-4 mb-4">
                    {message}
                </p>
            )}

            <section className="bg-white rounded-2xl shadow p-6 mb-6">
                <h3 className="text-xl font-bold text-purple-700 mb-2">
                    Pending Staff Registrations ({pending.length})
                </h3>

                <p className="text-sm text-gray-500 mb-4">
                    Staff register through Register Account on the login page, then wait here for
                    your approval. Verify that each person belongs to your salon team before
                    approving access.
                </p>

                {pending.length === 0 ? (
                    <p className="text-gray-500">No pending registration requests.</p>
                ) : (
                    <div className="space-y-3">
                        {pending.map((user) => (
                            <div
                                key={user.user_id}
                                className="flex flex-wrap items-center justify-between gap-3 border rounded-xl p-4"
                            >
                                <div>
                                    <strong>{user.username}</strong>
                                    <p className="text-sm text-gray-600">{user.email}</p>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        disabled={busy}
                                        onClick={() => approval(user, "approve")}
                                        className="bg-green-600 text-white px-4 py-2 rounded-lg"
                                    >
                                        Approve
                                    </button>

                                    <button
                                        disabled={busy}
                                        onClick={() => approval(user, "reject")}
                                        className="bg-red-50 text-red-700 px-4 py-2 rounded-lg"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="bg-purple-50 border border-purple-100 rounded-2xl p-6 mb-6">
                <h3 className="text-xl font-bold text-purple-800 mb-2">Invite the Real Owner</h3>

                <p className="text-sm text-purple-900 mb-4">
                    The real owner will choose her own username and password. Invitations are
                    private, email-specific, single-use, and valid for 24 hours. Keep the testing
                    account until the new owner has signed in.
                </p>

                <form onSubmit={createInvitation}>
                    <fieldset disabled={busy} className="grid md:grid-cols-3 gap-3">
                        <div>
                            <label
                                htmlFor="invite-email"
                                className="block text-sm font-semibold mb-2"
                            >
                                Real owner's email
                            </label>

                            <input
                                id="invite-email"
                                type="email"
                                value={inviteEmail}
                                onChange={(event) => setInviteEmail(event.target.value)}
                                required
                                maxLength={254}
                                className={inputClass}
                                placeholder="owner@example.com"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="invite-password"
                                className="block text-sm font-semibold mb-2"
                            >
                                Your current owner password
                            </label>

                            <input
                                id="invite-password"
                                type="password"
                                autoComplete="current-password"
                                value={invitePassword}
                                onChange={(event) => setInvitePassword(event.target.value)}
                                required
                                className={inputClass}
                            />
                        </div>

                        <button type="submit" className={`${primaryClass} self-end`}>
                            Generate Owner Invitation
                        </button>
                    </fieldset>
                </form>

                {inviteLink && (
                    <div className="bg-white rounded-xl p-4 mt-4">
                        <label
                            htmlFor="owner-invite-link"
                            className="block font-semibold text-sm mb-2"
                        >
                            Private invitation link — copy now
                        </label>

                        <input
                            id="owner-invite-link"
                            value={inviteLink}
                            readOnly
                            onFocus={(event) => event.target.select()}
                            className={`${inputClass} text-xs`}
                        />

                        <button
                            onClick={copyInvitation}
                            type="button"
                            className="mt-3 text-purple-700 font-semibold"
                        >
                            Copy Invitation Link
                        </button>

                        <p className="text-xs text-gray-500 mt-2">
                            Share privately, not in screenshots or public chats. The full link is
                            not stored and disappears when you leave this page.
                        </p>
                    </div>
                )}

                {invitations.length > 0 && (
                    <div className="mt-4 space-y-2">
                        {invitations.map((invitation) => (
                            <div
                                key={invitation.invitation_id}
                                className="flex flex-wrap justify-between items-center gap-2 text-sm border-t border-purple-200 pt-2"
                            >
                                <span>
                                    {invitation.email} · {invitation.status}
                                </span>

                                {invitation.status === "Pending" && (
                                    <button
                                        disabled={busy}
                                        onClick={() => revoke(invitation)}
                                        className="text-red-700 underline"
                                    >
                                        Revoke Invitation
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="bg-white rounded-2xl shadow p-6">
                <h3 className="text-xl font-bold text-purple-700 mb-4">User Accounts</h3>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b">
                                <th className="py-3">Username</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Created At</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            {users.map((user) => (
                                <tr key={user.user_id} className="border-b">
                                    <td className="py-4">
                                        {user.username}{" "}
                                        {Number(user.user_id) === Number(currentUser.user_id) && (
                                            <span className="text-xs text-gray-500">(You)</span>
                                        )}
                                    </td>

                                    <td>{user.email || "—"}</td>
                                    <td>{user.role}</td>
                                    <td>{user.account_status}</td>
                                    <td>{date(user.created_at)}</td>

                                    <td>
                                        <button
                                            disabled={
                                                busy ||
                                                Number(user.user_id) === Number(currentUser.user_id)
                                            }
                                            onClick={() => remove(user)}
                                            className="bg-red-500 text-white rounded-lg px-3 py-2 disabled:bg-gray-300"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    )
}
