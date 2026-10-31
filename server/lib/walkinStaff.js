// Independent walk-in staff reservations. No appointments are created or updated.
const { listQualifiedScheduledStaff, staffHasConflict } = require('./availability');
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const manilaDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
const manilaTime = () => new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Manila', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date());
function interval(start, duration) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(start || ''))) throw fail('Choose a valid walk-in start time (HH:mm).', 400);
  const minutes = Number(duration);
  if (!Number.isSafeInteger(minutes) || minutes <= 0 || minutes > 1440) throw fail('Invalid service duration.');
  const [h,m] = start.split(':').map(Number);
  const end = h * 60 + m + minutes;
  if (end >= 1440) throw fail('Walk-in service must finish on the same day. Choose an earlier start time.');
  return { startTime: start, endTime: `${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}` };
}
async function qualifiedStaff(conn, serviceId, date, start, end) {
  const candidates = await listQualifiedScheduledStaff(conn, {serviceId, appointmentDate:date, startTime:start, endTime:end});
  const result = [];
  for (const s of candidates) {
    const busy = await staffHasConflict(conn, {staffId:s.staff_id, appointmentDate:date, startTime:start, endTime:end});
    if (!busy) result.push({ staff_id:s.staff_id, name:s.name, role:s.role });
  }
  return result;
}
async function reserveWalkin(conn, {serviceId, staffId, date, startTime, endTime}) {
  // All checkout writers must lock staff in ascending order; booking writers lock staff too.
  const [[locked]] = await conn.query('SELECT staff_id FROM staff WHERE staff_id=? FOR UPDATE', [staffId]);
  if (!locked) throw fail('Selected staff no longer exists.');
  const available = await qualifiedStaff(conn, serviceId, date, startTime, endTime);
  if (!available.some(s => Number(s.staff_id) === Number(staffId))) throw fail('Selected staff is no longer available for the full service. Refresh staff availability.');
}
module.exports = { fail, manilaDate, manilaTime, interval, qualifiedStaff, reserveWalkin };
