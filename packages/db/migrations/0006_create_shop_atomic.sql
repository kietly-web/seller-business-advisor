-- One owned shop per user until multi-shop (Phase 3); a unique index also closes the double-submit race
CREATE UNIQUE INDEX shop_member_one_owned_shop ON app.shop_member (user_id) WHERE role = 'owner';
--> statement-breakpoint
CREATE FUNCTION app_ctx.create_shop(p_name text, p_category text, p_is_demo boolean, p_settings jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = app, pg_temp AS
$$
DECLARE
  v_user text := app_ctx.user_id();
  v_shop uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'app.user_id is not set' USING ERRCODE = '42501';
  END IF;
  INSERT INTO app.shop (name, category, is_demo, settings, order_hash_salt)
    VALUES (p_name, p_category, p_is_demo, coalesce(p_settings, '{}'::jsonb),
            uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()))
    RETURNING id INTO v_shop;
  INSERT INTO app.shop_member (shop_id, user_id, role) VALUES (v_shop, v_user, 'owner');
  INSERT INTO app.audit_log (shop_id, actor, action, entity, entity_id, meta)
    VALUES (v_shop, v_user, 'shop.created', 'shop', v_shop::text, jsonb_build_object('isDemo', p_is_demo));
  RETURN v_shop;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_ctx.create_shop(text, text, boolean, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_ctx.create_shop(text, text, boolean, jsonb) TO sa_app;
