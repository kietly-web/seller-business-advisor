-- Group roles only; per-environment LOGIN roles are created outside git and granted these (docs/design/02-data-model.md)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sa_app') THEN
    CREATE ROLE sa_app NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sa_worker') THEN
    CREATE ROLE sa_worker NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
CREATE SCHEMA app_ctx;
--> statement-breakpoint
CREATE FUNCTION app_ctx.user_id() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint
CREATE FUNCTION app_ctx.shop_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.shop_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_ctx.is_member(p_shop uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT EXISTS (SELECT 1 FROM app.shop_member WHERE shop_id = p_shop AND user_id = app_ctx.user_id()) $$;
--> statement-breakpoint
CREATE FUNCTION app_ctx.active_shop_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT id FROM app.shop ORDER BY id $$;
--> statement-breakpoint
CREATE FUNCTION app_ctx.create_shop(p_name text, p_category text, p_is_demo boolean) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = app, pg_temp AS
$$
DECLARE
  v_user text := app_ctx.user_id();
  v_shop uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'app.user_id is not set' USING ERRCODE = '42501';
  END IF;
  INSERT INTO app.shop (name, category, is_demo, order_hash_salt)
    VALUES (p_name, p_category, p_is_demo, uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()))
    RETURNING id INTO v_shop;
  INSERT INTO app.shop_member (shop_id, user_id, role) VALUES (v_shop, v_user, 'owner');
  RETURN v_shop;
END
$$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app_ctx FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_ctx FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app, app_ctx TO sa_app, sa_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_ctx.user_id(), app_ctx.shop_id() TO sa_app, sa_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_ctx.is_member(uuid) TO sa_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_ctx.create_shop(text, text, boolean) TO sa_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_ctx.active_shop_ids() TO sa_worker;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO sa_app, sa_worker;
--> statement-breakpoint
-- Standard tenant tables: same template, forced so even the owner role is filtered
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'upload', 'ingest_stage', 'sku', 'order_line', 'fee_line', 'product_traffic',
    'unit_cost', 'stock_snapshot', 'competitor_listing', 'competitor_observation',
    'sku_week_metric', 'recommendation_run', 'recommendation', 'outcome'
  ] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY app_rw ON app.%I FOR ALL TO sa_app
         USING (shop_id = app_ctx.shop_id() AND app_ctx.is_member(shop_id))
         WITH CHECK (shop_id = app_ctx.shop_id() AND app_ctx.is_member(shop_id))', t);
    EXECUTE format(
      'CREATE POLICY worker_rw ON app.%I FOR ALL TO sa_worker
         USING (shop_id = app_ctx.shop_id())
         WITH CHECK (shop_id = app_ctx.shop_id())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON app.%I TO sa_app, sa_worker', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- shop and shop_member are read by the SECURITY DEFINER functions above, so they are not FORCEd: the owner must bypass RLS there
ALTER TABLE app.shop ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_select ON app.shop FOR SELECT TO sa_app USING (app_ctx.is_member(id));
--> statement-breakpoint
CREATE POLICY app_update ON app.shop FOR UPDATE TO sa_app
  USING (id = app_ctx.shop_id() AND app_ctx.is_member(id))
  WITH CHECK (id = app_ctx.shop_id() AND app_ctx.is_member(id));
--> statement-breakpoint
CREATE POLICY worker_rw ON app.shop FOR ALL TO sa_worker
  USING (id = app_ctx.shop_id()) WITH CHECK (id = app_ctx.shop_id());
--> statement-breakpoint
GRANT SELECT, UPDATE (name, category, settings) ON app.shop TO sa_app;
--> statement-breakpoint
GRANT SELECT, UPDATE, DELETE ON app.shop TO sa_worker;
--> statement-breakpoint
ALTER TABLE app.shop_member ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_select_own ON app.shop_member FOR SELECT TO sa_app USING (user_id = app_ctx.user_id());
--> statement-breakpoint
CREATE POLICY worker_rw ON app.shop_member FOR ALL TO sa_worker
  USING (shop_id = app_ctx.shop_id()) WITH CHECK (shop_id = app_ctx.shop_id());
--> statement-breakpoint
GRANT SELECT ON app.shop_member TO sa_app;
--> statement-breakpoint
GRANT SELECT ON app.shop_member TO sa_worker;
--> statement-breakpoint
ALTER TABLE app.consent_record ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.consent_record FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_own ON app.consent_record FOR ALL TO sa_app
  USING (user_id = app_ctx.user_id()) WITH CHECK (user_id = app_ctx.user_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON app.consent_record TO sa_app;
--> statement-breakpoint
ALTER TABLE app.data_request ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.data_request FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_own ON app.data_request FOR ALL TO sa_app
  USING (user_id = app_ctx.user_id()) WITH CHECK (user_id = app_ctx.user_id());
--> statement-breakpoint
CREATE POLICY worker_all ON app.data_request FOR ALL TO sa_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT (user_id, kind) ON app.data_request TO sa_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON app.data_request TO sa_worker;
--> statement-breakpoint
-- Decree 356 timers: ack in 2 working days; access/export/correct 10 days, withdrawal 15, deletion 20 (docs/design/03-security-privacy.md)
CREATE FUNCTION app_ctx.set_data_request_timers() RETURNS trigger
LANGUAGE plpgsql SET search_path = app, pg_temp AS
$$
DECLARE
  v_ack timestamptz := now();
  v_added int := 0;
BEGIN
  WHILE v_added < 2 LOOP
    v_ack := v_ack + interval '1 day';
    IF extract(isodow FROM v_ack AT TIME ZONE 'Asia/Ho_Chi_Minh') < 6 THEN
      v_added := v_added + 1;
    END IF;
  END LOOP;
  NEW.received_at := now();
  NEW.ack_due_at := v_ack;
  NEW.due_at := now() + CASE NEW.kind
    WHEN 'withdraw_consent' THEN interval '15 days'
    WHEN 'delete' THEN interval '20 days'
    ELSE interval '10 days'
  END;
  NEW.status := 'open';
  NEW.acked_at := NULL;
  NEW.completed_at := NULL;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER data_request_timers BEFORE INSERT ON app.data_request
  FOR EACH ROW EXECUTE FUNCTION app_ctx.set_data_request_timers();
--> statement-breakpoint
ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_select ON app.audit_log FOR SELECT TO sa_app
  USING (shop_id = app_ctx.shop_id() AND app_ctx.is_member(shop_id));
--> statement-breakpoint
CREATE POLICY app_insert ON app.audit_log FOR INSERT TO sa_app
  WITH CHECK (
    actor = app_ctx.user_id()
    AND (shop_id IS NULL OR (shop_id = app_ctx.shop_id() AND app_ctx.is_member(shop_id)))
  );
--> statement-breakpoint
CREATE POLICY worker_insert ON app.audit_log FOR INSERT TO sa_worker
  WITH CHECK (shop_id IS NULL OR shop_id = app_ctx.shop_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON app.audit_log TO sa_app;
--> statement-breakpoint
GRANT INSERT ON app.audit_log TO sa_worker;
--> statement-breakpoint
ALTER TABLE app.job ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.job FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_enqueue ON app.job FOR INSERT TO sa_app
  WITH CHECK (shop_id = app_ctx.shop_id() AND app_ctx.is_member(shop_id));
--> statement-breakpoint
CREATE POLICY worker_all ON app.job FOR ALL TO sa_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT INSERT ON app.job TO sa_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.job TO sa_worker;
--> statement-breakpoint
ALTER TABLE app.llm_call ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.llm_call FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_insert ON app.llm_call FOR INSERT TO sa_app
  WITH CHECK (shop_id IS NULL OR (shop_id = app_ctx.shop_id() AND app_ctx.is_member(shop_id)));
--> statement-breakpoint
CREATE POLICY worker_insert ON app.llm_call FOR INSERT TO sa_worker
  WITH CHECK (shop_id IS NULL OR shop_id = app_ctx.shop_id());
--> statement-breakpoint
GRANT INSERT ON app.llm_call TO sa_app, sa_worker;
--> statement-breakpoint
ALTER TABLE app.rule_track_record ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.rule_track_record FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_select ON app.rule_track_record FOR SELECT TO sa_app
  USING (shop_id IS NULL OR (shop_id = app_ctx.shop_id() AND app_ctx.is_member(shop_id)));
--> statement-breakpoint
CREATE POLICY worker_rw ON app.rule_track_record FOR ALL TO sa_worker
  USING (shop_id IS NULL OR shop_id = app_ctx.shop_id())
  WITH CHECK (shop_id IS NULL OR shop_id = app_ctx.shop_id());
--> statement-breakpoint
GRANT SELECT ON app.rule_track_record TO sa_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON app.rule_track_record TO sa_worker;
