function normalizeTime(value) {
    const time = String(value || "").slice(0, 5)
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        throw new Error("Time must use HH:MM format")
    }
    return time
}

function timeToMinutes(value) {
    const [hours, minutes] = normalizeTime(value).split(":").map(Number)
    return hours * 60 + minutes
}

function minutesToTime(totalMinutes) {
    if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes >= 1440) {
        throw new Error("Appointment must begin and end on the same day")
    }

    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0")
    const minutes = String(totalMinutes % 60).padStart(2, "0")
    return `${hours}:${minutes}`
}

function addMinutes(value, durationMinutes) {
    const duration = Number(durationMinutes)
    if (!Number.isInteger(duration) || duration <= 0) {
        throw new Error("Service duration must be a positive number of minutes")
    }
    return minutesToTime(timeToMinutes(value) + duration)
}

function isValidDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
}

function intervalsOverlap(newStart, newEnd, existingStart, existingEnd) {
    return (
        timeToMinutes(newStart) < timeToMinutes(existingEnd) &&
        timeToMinutes(newEnd) > timeToMinutes(existingStart)
    )
}

module.exports = { addMinutes, intervalsOverlap, isValidDate, normalizeTime, timeToMinutes }
