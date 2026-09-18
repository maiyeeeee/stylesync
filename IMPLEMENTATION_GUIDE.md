# StyleSync Panel Revision — Setup, Testing, and Demo Guide

This revision implements the two required pre-oral panel recommendations:

1. **Staff Availability + Appointment Conflict Validation**
2. **Emergency Offline Recording, Synchronization, and Database Backup**

The revised package is source-only. It intentionally excludes `node_modules`, database passwords, generated backups, and build output.

## Important security step

The database password was visible in a screenshot shared during troubleshooting. Change that MySQL password before the next demo or deployment. Store the new value only in the root `.env` file. Never upload `.env`, `server/db.js` with a real password, or database backup files to a public repository.

## What was implemented

### Staff availability and conflict validation

- Numeric service duration in minutes
- Staff profiles and active/daily availability status
- Staff-to-service qualifications
- Weekly shifts
- Dated leave, break, day-off, or emergency unavailable periods
- Full interval calculation using the appointment start plus service duration
- Conflict validation for the complete interval, not only the start time
- Automatic assignment of one qualified available staff member
- Revalidation when an admin approves or reassigns an appointment
- Transaction and row locking to protect against near-simultaneous double booking

### Emergency offline and backup

- Admin Emergency page for local appointment, sale/payment, and inventory recording
- Browser IndexedDB queue with a unique offline ID for each record
- Pending, Syncing, Synced, Failed, and Needs Review states
- Cached service and inventory reference data
- Service worker app-shell cache for emergency access after the page has been opened online
- Manual synchronization when connectivity returns
- Duplicate protection so retrying a synchronized record does not insert it twice
- Server-side validation during synchronization
- Conflicting offline appointments remain local as **Needs Review** and are not silently confirmed
- MySQL backup and explicit restore scripts
- Configurable backup retention

## 1. Make a safe working copy

Do not replace your current working project immediately.

1. Copy your original StyleSync folder and name the copy `stylesync-before-panel-revision`.
2. Extract this revised ZIP into a separate folder such as `stylesync-panel-revision`.
3. Keep the original folder and database backup until all acceptance tests pass.

## 2. Create the environment files

Open Command Prompt in the extracted project folder. An easy method is to open the folder in File Explorer, click the address bar, type `cmd`, and press Enter.

At the project root, run:

```bat
copy .env.example .env
```

Open `.env` in VS Code or Notepad and replace the sample database values:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_NEW_MYSQL_PASSWORD
DB_NAME=stylesync_db
DB_POOL_SIZE=10
BACKUP_DIR=backups
BACKUP_RETENTION_DAYS=30
```

Then create the client environment file:

```bat
cd client
copy .env.example .env
cd ..
```

The client `.env` should contain:

```env
VITE_API_URL=http://localhost:5000
```

## 3. Back up the existing database

Before running the migration, use MySQL Workbench:

1. Open **Server > Data Export**.
2. Select `stylesync_db` and all its tables.
3. Select **Export to Self-Contained File**.
4. Choose a safe `.sql` filename.
5. Select **Start Export**.

Do not skip this step.

## 4. Apply the database migration

1. Open MySQL Workbench and connect to the StyleSync database.
2. Select **File > Open SQL Script**.
3. Open `database/2026_panel_revisions.sql` from this project.
4. Confirm the first line is `USE stylesync_db;`. If your database has a different name, change only that name.
5. Click the lightning-bolt **Execute** button.
6. Refresh the Schemas panel.

The following new tables should appear:

- `staff`
- `staff_services`
- `staff_schedule`
- `staff_unavailability`
- `inventory_movements`
- `backup_runs`

The migration also adds required fields to `services`, `appointments`, `transactions`, and `customers`. It is written to avoid adding the same columns or indexes twice.

## 5. Install dependencies

From the project root:

```bat
npm install
cd client
npm install
cd ..
```

## 6. Start StyleSync

Use two Command Prompt windows.

In the first window, from the project root:

```bat
npm start
```

Expected message:

```text
MySQL Connected Successfully
Server running on port 5000
```

In the second window:

```bat
cd client
npm run dev
```

Open the local URL shown by Vite, normally `http://localhost:5173`.

## 7. Required initial data setup

Availability checking intentionally rejects a booking when no qualified staff is configured.

1. Log in as admin.
2. Open **Services**.
3. Edit every available service and confirm its numeric duration in minutes, such as `60`, `90`, or `120`.
4. Open **Staff**.
5. Add each employee, select the services they are qualified to perform, select their working days, and enter their shift.
6. Use **Mark Unavailable** for a whole-day/manual override.
7. Use **Add Leave/Break** for a specific dated unavailable interval.

## 8. Staff availability acceptance tests

Use one 120-minute service and a staff shift of 09:00–18:00.

| Test               | Action                                                                     | Expected result                       |
| ------------------ | -------------------------------------------------------------------------- | ------------------------------------- |
| Full interval      | Book the 120-minute service at 10:00                                       | Interval shown as 10:00–12:00         |
| Exact overlap      | Try the same staff/service at 10:00                                        | Rejected                              |
| Partial overlap    | Try at 11:00                                                               | Rejected because 11:00–13:00 overlaps |
| Back-to-back       | Try at 12:00                                                               | Allowed if no other conflict exists   |
| Shift boundary     | Try at 17:00                                                               | Rejected because it ends after 18:00  |
| Qualification      | Remove that service from the staff member                                  | Slot becomes unavailable              |
| Daily override     | Mark the staff member Unavailable                                          | Slot becomes unavailable              |
| Leave/break        | Add an unavailable period covering 10:30–11:00                             | The 10:00–12:00 slot is rejected      |
| Approval recheck   | Create a pending request, then create a new conflict before approving it   | Approval is blocked                   |
| Concurrent booking | Submit the same last available slot in two browser windows almost together | Only one succeeds                     |

## 9. Emergency offline acceptance tests

Emergency Mode must be prepared once while online so the browser can cache the page and reference data.

1. While online and logged in, open **Admin > Emergency**.
2. Wait until cached services and inventory items appear.
3. In Chrome DevTools, open **Network** and select **Offline**, or disconnect Wi-Fi.
4. Reload the Emergency page to prove the cached app shell opens.
5. Save an appointment, sale/payment, and inventory adjustment.
6. Confirm every item appears with **Pending** status and a unique offline ID.
7. Restore the connection.
8. Select **Sync Pending Records**.
9. Confirm valid records become **Synced**.
10. Select Sync again and confirm no duplicate server records appear.

For the conflict rule:

1. While offline, record two appointments that require the same last available staff interval.
2. Reconnect and synchronize.
3. The first valid item should synchronize.
4. The conflicting item should be marked **Needs Review** with a conflict message.
5. Record a corrected appointment for another available time, synchronize it, and clear only the successfully synced local copies.

Important limitations to explain honestly during the defense:

- Pending offline records are stored on the specific browser/device used to record them.
- Do not clear browser site data while records are pending.
- An offline appointment is provisional; it is never promised to the customer until server validation succeeds.
- Emergency mode is designed for essential continuity, not every online-only administrative feature.

## 10. Database backup and recovery

Run a manual backup from the project root:

```bat
npm run backup
```

The backup is created in `backups` by default. The script uses `mysqldump`, so the MySQL `bin` directory must be available in the Windows PATH. If Windows says `mysqldump` is not recognized, add the MySQL Server `bin` folder to PATH or use its full path in Windows Task Scheduler.

Schedule `npm run backup` in Windows Task Scheduler for daily execution on the actual deployment computer. Keep at least one additional copy on a separate protected drive.

Test recovery only against a separate test database first. The restore command overwrites data in the database named by `.env`:

```bat
npm run restore -- backups\stylesync-YOUR-TIMESTAMP.sql
```

Never test restore directly on the only live database.

## 11. Automated checks

Backend syntax and interval unit tests:

```bat
npm test
```

Client production build:

```bat
cd client
npm run build
```

Run both before every panel demo. A successful build is not a replacement for the browser and database acceptance tests above.

## Recommended defense demonstration order

1. Show service duration and staff qualification/shift setup.
2. Show the displayed full appointment interval.
3. Demonstrate a partial-overlap rejection and a valid back-to-back booking.
4. Demonstrate staff daily unavailability or a leave/break conflict.
5. Open Emergency Mode online, disconnect, and save a provisional appointment.
6. Reconnect and synchronize it.
7. Demonstrate a conflicting offline appointment becoming Needs Review.
8. Run a manual database backup and show the timestamped `.sql` file.

This order directly addresses the required panel revisions before presenting optional or older system modules.
