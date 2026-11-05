-- Database-level protection. The app connects as daf_app, which is not a table owner
-- and cannot bypass row-level security. withActor() sets app.role and app.user_id per transaction.

CREATE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.role', true), '') $$;

CREATE FUNCTION app_user_id() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.user_id', true), '') $$;

CREATE FUNCTION app_is_staff() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT app_role() IN ('admin', 'super_admin', 'system') $$;

CREATE FUNCTION app_is_owner() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT app_role() IN ('super_admin', 'system') $$;

GRANT EXECUTE ON FUNCTION app_role(), app_user_id(), app_is_staff(), app_is_owner() TO daf_app;

-- Least privilege: nothing is granted unless listed here.
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", session, account, verification, two_factor, rate_limit, rate_limit_bucket TO daf_app;
GRANT SELECT, INSERT, UPDATE ON service_category, service, add_on, setting, cleaner, notification_outbox TO daf_app;
GRANT SELECT, INSERT, UPDATE ON booking TO daf_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON customer_address, booking_add_on, booking_assignment TO daf_app;
GRANT SELECT, INSERT ON booking_event, audit_log TO daf_app;

-- Catalogue and settings: readable by everyone, changed only by the Super Admin.
ALTER TABLE service_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_category FORCE ROW LEVEL SECURITY;
ALTER TABLE service ENABLE ROW LEVEL SECURITY;
ALTER TABLE service FORCE ROW LEVEL SECURITY;
ALTER TABLE add_on ENABLE ROW LEVEL SECURITY;
ALTER TABLE add_on FORCE ROW LEVEL SECURITY;
ALTER TABLE setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE setting FORCE ROW LEVEL SECURITY;

CREATE POLICY read_all ON service_category FOR SELECT USING (true);
CREATE POLICY owner_write ON service_category FOR ALL USING (app_is_owner()) WITH CHECK (app_is_owner());
CREATE POLICY read_all ON service FOR SELECT USING (true);
CREATE POLICY owner_write ON service FOR ALL USING (app_is_owner()) WITH CHECK (app_is_owner());
CREATE POLICY read_all ON add_on FOR SELECT USING (true);
CREATE POLICY owner_write ON add_on FOR ALL USING (app_is_owner()) WITH CHECK (app_is_owner());
CREATE POLICY read_all ON setting FOR SELECT USING (true);
CREATE POLICY owner_write ON setting FOR ALL USING (app_is_owner()) WITH CHECK (app_is_owner());

-- Customer data: staff see everything, customers only their own rows.
ALTER TABLE customer_address ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_address FORCE ROW LEVEL SECURITY;
CREATE POLICY address_access ON customer_address FOR ALL
  USING (app_is_staff() OR user_id = app_user_id())
  WITH CHECK (app_is_staff() OR user_id = app_user_id());

ALTER TABLE booking ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_access ON booking FOR ALL
  USING (app_is_staff() OR customer_id = app_user_id())
  WITH CHECK (app_is_staff() OR customer_id = app_user_id());

-- Child rows follow the parent booking's visibility.
ALTER TABLE booking_add_on ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_add_on FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_add_on_access ON booking_add_on FOR ALL
  USING (EXISTS (SELECT 1 FROM booking b WHERE b.id = booking_id))
  WITH CHECK (EXISTS (SELECT 1 FROM booking b WHERE b.id = booking_id));

ALTER TABLE booking_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_event FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_event_access ON booking_event FOR ALL
  USING (EXISTS (SELECT 1 FROM booking b WHERE b.id = booking_id))
  WITH CHECK (EXISTS (SELECT 1 FROM booking b WHERE b.id = booking_id));

ALTER TABLE booking_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_assignment_read ON booking_assignment FOR SELECT
  USING (EXISTS (SELECT 1 FROM booking b WHERE b.id = booking_id));
CREATE POLICY booking_assignment_write ON booking_assignment FOR ALL
  USING (app_is_staff()) WITH CHECK (app_is_staff());

-- Staff-only operational data.
ALTER TABLE cleaner ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaner FORCE ROW LEVEL SECURITY;
CREATE POLICY cleaner_staff ON cleaner FOR ALL USING (app_is_staff()) WITH CHECK (app_is_staff());

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_staff ON notification_outbox FOR ALL USING (app_is_staff()) WITH CHECK (app_is_staff());

-- Audit log: anyone may add a row, only the Super Admin may read, nobody may change or remove one.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY audit_read ON audit_log FOR SELECT USING (app_is_owner());

CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;

CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
