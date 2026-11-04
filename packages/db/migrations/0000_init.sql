CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."consent_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" text NOT NULL,
	"ui_text_hash" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_record_purpose_check" CHECK ("app"."consent_record"."purpose" in ('service_processing', 'anonymised_benchmarking', 'marketing'))
);
--> statement-breakpoint
CREATE TABLE "app"."shop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"platform" text DEFAULT 'shopee' NOT NULL,
	"category" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"order_hash_salt" "bytea" NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_platform_check" CHECK ("app"."shop"."platform" in ('shopee', 'tiktok', 'lazada'))
);
--> statement-breakpoint
CREATE TABLE "app"."shop_member" (
	"shop_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "shop_member_shop_id_user_id_pk" PRIMARY KEY("shop_id","user_id"),
	CONSTRAINT "shop_member_role_check" CHECK ("app"."shop_member"."role" in ('owner', 'staff'))
);
--> statement-breakpoint
CREATE TABLE "app"."ingest_stage" (
	"upload_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"record_kind" text NOT NULL,
	"source_row" integer NOT NULL,
	"record" jsonb NOT NULL,
	CONSTRAINT "ingest_stage_upload_id_record_kind_source_row_pk" PRIMARY KEY("upload_id","record_kind","source_row"),
	CONSTRAINT "ingest_stage_kind_check" CHECK ("app"."ingest_stage"."record_kind" in ('order_line', 'fee_line', 'product_traffic', 'sku', 'stock'))
);
--> statement-breakpoint
CREATE TABLE "app"."upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"uploaded_by" text NOT NULL,
	"export_type" text NOT NULL,
	"parser_id" text NOT NULL,
	"file_sha256" text NOT NULL,
	"file_name" text NOT NULL,
	"removed_columns" jsonb NOT NULL,
	"row_count" integer,
	"period_from" date,
	"period_to" date,
	"status" text NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parsed_at" timestamp with time zone,
	CONSTRAINT "upload_shop_file_unique" UNIQUE("shop_id","file_sha256"),
	CONSTRAINT "upload_status_check" CHECK ("app"."upload"."status" in ('receiving', 'parsed', 'failed', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "app"."fee_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"source_row" integer NOT NULL,
	"order_hash" text NOT NULL,
	"sku_id" uuid,
	"fee_type" text NOT NULL,
	"amount_vnd" bigint NOT NULL,
	"incurred_on" date NOT NULL,
	CONSTRAINT "fee_line_type_check" CHECK ("app"."fee_line"."fee_type" in ('commission', 'transaction', 'service', 'shipping_seller', 'affiliate', 'ads', 'other')),
	CONSTRAINT "fee_line_hash_check" CHECK ("app"."fee_line"."order_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "app"."order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"source_row" integer NOT NULL,
	"order_hash" text NOT NULL,
	"order_status" text NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"sku_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_list_price_vnd" bigint NOT NULL,
	"gross_revenue_vnd" bigint NOT NULL,
	"seller_discount_vnd" bigint DEFAULT 0 NOT NULL,
	"platform_discount_vnd" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "order_line_order_sku_unique" UNIQUE("shop_id","order_hash","sku_id"),
	CONSTRAINT "order_line_quantity_check" CHECK ("app"."order_line"."quantity" >= 0),
	CONSTRAINT "order_line_status_check" CHECK ("app"."order_line"."order_status" in ('completed', 'cancelled', 'returned', 'in_progress')),
	CONSTRAINT "order_line_hash_check" CHECK ("app"."order_line"."order_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "app"."product_traffic" (
	"shop_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer,
	"visitors" integer,
	"add_to_cart" integer,
	"orders" integer,
	"units" integer,
	"upload_id" uuid NOT NULL,
	"source_row" integer NOT NULL,
	CONSTRAINT "product_traffic_shop_id_sku_id_day_pk" PRIMARY KEY("shop_id","sku_id","day")
);
--> statement-breakpoint
CREATE TABLE "app"."sku" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"platform_item_id" text,
	"platform_model_id" text,
	"seller_sku" text,
	"name" text NOT NULL,
	"variation" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sku_platform_unique" UNIQUE("shop_id","platform_item_id","platform_model_id")
);
--> statement-breakpoint
CREATE TABLE "app"."competitor_listing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_listing_url_check" CHECK ("app"."competitor_listing"."url" ~ '^https://(shopee\.vn|s\.shopee\.vn)/')
);
--> statement-breakpoint
CREATE TABLE "app"."competitor_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"price_vnd" bigint NOT NULL,
	"observed_on" date NOT NULL,
	"note" text,
	CONSTRAINT "competitor_observation_price_check" CHECK ("app"."competitor_observation"."price_vnd" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."stock_snapshot" (
	"shop_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"on_hand" integer NOT NULL,
	"lead_time_days" integer,
	CONSTRAINT "stock_snapshot_shop_id_sku_id_as_of_pk" PRIMARY KEY("shop_id","sku_id","as_of")
);
--> statement-breakpoint
CREATE TABLE "app"."unit_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"cogs_vnd" bigint NOT NULL,
	"packaging_vnd" bigint DEFAULT 0 NOT NULL,
	"effective_from" date NOT NULL,
	"source" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_cost_sku_effective_unique" UNIQUE("shop_id","sku_id","effective_from"),
	CONSTRAINT "unit_cost_cogs_check" CHECK ("app"."unit_cost"."cogs_vnd" >= 0),
	CONSTRAINT "unit_cost_source_check" CHECK ("app"."unit_cost"."source" in ('template', 'inline', 'category_default'))
);
--> statement-breakpoint
CREATE TABLE "app"."outcome" (
	"recommendation_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"horizon_days" smallint NOT NULL,
	"baseline" jsonb NOT NULL,
	"observed" jsonb NOT NULL,
	"delta_units_per_day" numeric,
	"delta_margin_vnd_per_day" numeric,
	"result" text NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_recommendation_id_horizon_days_pk" PRIMARY KEY("recommendation_id","horizon_days"),
	CONSTRAINT "outcome_horizon_check" CHECK ("app"."outcome"."horizon_days" in (7, 14)),
	CONSTRAINT "outcome_result_check" CHECK ("app"."outcome"."result" in ('positive', 'neutral', 'negative', 'insufficient_data'))
);
--> statement-breakpoint
CREATE TABLE "app"."recommendation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"sku_id" uuid,
	"rule_code" text NOT NULL,
	"rule_version" integer NOT NULL,
	"action_type" text NOT NULL,
	"rank" smallint NOT NULL,
	"score" numeric NOT NULL,
	"impact_low_vnd" bigint NOT NULL,
	"impact_high_vnd" bigint NOT NULL,
	"confidence" text NOT NULL,
	"confidence_value" numeric(5, 4) NOT NULL,
	"facts" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"text_vi" jsonb NOT NULL,
	"text_source" text NOT NULL,
	"status" text DEFAULT 'shown' NOT NULL,
	"dismiss_reason" text,
	"decided_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"rating" smallint,
	CONSTRAINT "recommendation_rank_check" CHECK ("app"."recommendation"."rank" between 1 and 5),
	CONSTRAINT "recommendation_confidence_check" CHECK ("app"."recommendation"."confidence" in ('low', 'medium', 'high')),
	CONSTRAINT "recommendation_text_source_check" CHECK ("app"."recommendation"."text_source" in ('llm', 'template')),
	CONSTRAINT "recommendation_status_check" CHECK ("app"."recommendation"."status" in ('shown', 'accepted', 'dismissed', 'done', 'expired')),
	CONSTRAINT "recommendation_rating_check" CHECK ("app"."recommendation"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "app"."recommendation_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"iso_week" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"engine_version" text NOT NULL,
	"llm_model" text,
	"llm_fallback_used" boolean,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "recommendation_run_trigger_check" CHECK ("app"."recommendation_run"."trigger" in ('weekly', 'on_demand')),
	CONSTRAINT "recommendation_run_status_check" CHECK ("app"."recommendation_run"."status" in ('running', 'succeeded', 'insufficient_data', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "app"."rule_track_record" (
	"shop_id" uuid,
	"rule_code" text NOT NULL,
	"alpha" numeric DEFAULT '1' NOT NULL,
	"beta" numeric DEFAULT '1' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_track_record_shop_rule_unique" UNIQUE NULLS NOT DISTINCT("shop_id","rule_code")
);
--> statement-breakpoint
CREATE TABLE "app"."sku_week_metric" (
	"shop_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"iso_week" text NOT NULL,
	"units" integer NOT NULL,
	"orders" integer NOT NULL,
	"gross_revenue_vnd" bigint NOT NULL,
	"seller_discount_vnd" bigint NOT NULL,
	"net_revenue_vnd" bigint NOT NULL,
	"platform_fees_vnd" bigint NOT NULL,
	"cogs_vnd" bigint,
	"contribution_margin_vnd" bigint,
	"margin_pct" numeric(7, 4),
	"avg_selling_price_vnd" bigint,
	"views" integer,
	"visitors" integer,
	"conversion_pct" numeric(7, 4),
	"on_hand" integer,
	"stock_cover_days" numeric(8, 2),
	"competitor_median_vnd" bigint,
	"price_gap_pct" numeric(7, 4),
	"inputs_hash" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sku_week_metric_shop_id_sku_id_iso_week_pk" PRIMARY KEY("shop_id","sku_id","iso_week"),
	CONSTRAINT "sku_week_metric_week_check" CHECK ("app"."sku_week_metric"."iso_week" ~ '^[0-9]{4}-W[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "app"."audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"shop_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."data_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ack_due_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"acked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	CONSTRAINT "data_request_kind_check" CHECK ("app"."data_request"."kind" in ('access', 'export', 'correct', 'withdraw_consent', 'delete')),
	CONSTRAINT "data_request_status_check" CHECK ("app"."data_request"."status" in ('open', 'acked', 'completed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "app"."job" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."job_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"shop_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"done_at" timestamp with time zone,
	"dedupe_key" text,
	CONSTRAINT "job_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "app"."llm_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"latency_ms" integer,
	"cost_usd" numeric(10, 6),
	"validation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_call_validation_check" CHECK ("app"."llm_call"."validation" in ('passed', 'failed_placeholder', 'failed_schema', 'refused', 'error'))
);
--> statement-breakpoint
ALTER TABLE "app"."shop_member" ADD CONSTRAINT "shop_member_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ingest_stage" ADD CONSTRAINT "ingest_stage_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "app"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ingest_stage" ADD CONSTRAINT "ingest_stage_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."upload" ADD CONSTRAINT "upload_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fee_line" ADD CONSTRAINT "fee_line_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fee_line" ADD CONSTRAINT "fee_line_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "app"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fee_line" ADD CONSTRAINT "fee_line_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_line" ADD CONSTRAINT "order_line_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_line" ADD CONSTRAINT "order_line_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "app"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_line" ADD CONSTRAINT "order_line_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_traffic" ADD CONSTRAINT "product_traffic_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_traffic" ADD CONSTRAINT "product_traffic_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_traffic" ADD CONSTRAINT "product_traffic_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "app"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sku" ADD CONSTRAINT "sku_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."competitor_listing" ADD CONSTRAINT "competitor_listing_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."competitor_listing" ADD CONSTRAINT "competitor_listing_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."competitor_observation" ADD CONSTRAINT "competitor_observation_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."competitor_observation" ADD CONSTRAINT "competitor_observation_listing_id_competitor_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "app"."competitor_listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_snapshot" ADD CONSTRAINT "stock_snapshot_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_snapshot" ADD CONSTRAINT "stock_snapshot_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."unit_cost" ADD CONSTRAINT "unit_cost_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."unit_cost" ADD CONSTRAINT "unit_cost_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."outcome" ADD CONSTRAINT "outcome_recommendation_id_recommendation_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "app"."recommendation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."outcome" ADD CONSTRAINT "outcome_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."recommendation" ADD CONSTRAINT "recommendation_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."recommendation" ADD CONSTRAINT "recommendation_run_id_recommendation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "app"."recommendation_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."recommendation" ADD CONSTRAINT "recommendation_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."recommendation_run" ADD CONSTRAINT "recommendation_run_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."rule_track_record" ADD CONSTRAINT "rule_track_record_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sku_week_metric" ADD CONSTRAINT "sku_week_metric_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sku_week_metric" ADD CONSTRAINT "sku_week_metric_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD CONSTRAINT "audit_log_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."job" ADD CONSTRAINT "job_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."llm_call" ADD CONSTRAINT "llm_call_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "app"."shop"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_line_shop_order_idx" ON "app"."fee_line" USING btree ("shop_id","order_hash");--> statement-breakpoint
CREATE INDEX "order_line_shop_sku_completed_idx" ON "app"."order_line" USING btree ("shop_id","sku_id","completed_at");--> statement-breakpoint
CREATE INDEX "recommendation_shop_run_idx" ON "app"."recommendation" USING btree ("shop_id","run_id");--> statement-breakpoint
CREATE INDEX "job_due_idx" ON "app"."job" USING btree ("run_after") WHERE "app"."job"."done_at" is null;