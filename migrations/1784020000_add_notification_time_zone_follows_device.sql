-- Reminder times were computed from a zone captured once at onboarding, so a
-- student who moved kept getting reminders on their old clock. The zone now
-- tracks the device by default; picking one by hand pins it instead.
ALTER TABLE notification_preferences
ADD COLUMN time_zone_follows_device BOOLEAN NOT NULL DEFAULT TRUE;
