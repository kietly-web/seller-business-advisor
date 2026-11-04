ALTER TABLE "app"."job" DROP CONSTRAINT "job_dedupe_key_unique";--> statement-breakpoint
ALTER TABLE "app"."ingest_stage" DROP CONSTRAINT "ingest_stage_upload_id_upload_id_fk";--> statement-breakpoint
ALTER TABLE "app"."fee_line" DROP CONSTRAINT "fee_line_upload_id_upload_id_fk";--> statement-breakpoint
ALTER TABLE "app"."fee_line" DROP CONSTRAINT "fee_line_sku_id_sku_id_fk";--> statement-breakpoint
ALTER TABLE "app"."order_line" DROP CONSTRAINT "order_line_upload_id_upload_id_fk";--> statement-breakpoint
ALTER TABLE "app"."order_line" DROP CONSTRAINT "order_line_sku_id_sku_id_fk";--> statement-breakpoint
ALTER TABLE "app"."product_traffic" DROP CONSTRAINT "product_traffic_sku_id_sku_id_fk";--> statement-breakpoint
ALTER TABLE "app"."product_traffic" DROP CONSTRAINT "product_traffic_upload_id_upload_id_fk";--> statement-breakpoint
ALTER TABLE "app"."competitor_listing" DROP CONSTRAINT "competitor_listing_sku_id_sku_id_fk";--> statement-breakpoint
ALTER TABLE "app"."competitor_observation" DROP CONSTRAINT "competitor_observation_listing_id_competitor_listing_id_fk";--> statement-breakpoint
ALTER TABLE "app"."stock_snapshot" DROP CONSTRAINT "stock_snapshot_sku_id_sku_id_fk";--> statement-breakpoint
ALTER TABLE "app"."unit_cost" DROP CONSTRAINT "unit_cost_sku_id_sku_id_fk";--> statement-breakpoint
ALTER TABLE "app"."outcome" DROP CONSTRAINT "outcome_recommendation_id_recommendation_id_fk";--> statement-breakpoint
ALTER TABLE "app"."recommendation" DROP CONSTRAINT "recommendation_run_id_recommendation_run_id_fk";--> statement-breakpoint
ALTER TABLE "app"."recommendation" DROP CONSTRAINT "recommendation_sku_id_sku_id_fk";--> statement-breakpoint
ALTER TABLE "app"."sku_week_metric" DROP CONSTRAINT "sku_week_metric_sku_id_sku_id_fk";--> statement-breakpoint
ALTER TABLE "app"."ingest_stage" DROP CONSTRAINT "ingest_stage_upload_id_record_kind_source_row_pk";--> statement-breakpoint
ALTER TABLE "app"."outcome" DROP CONSTRAINT "outcome_recommendation_id_horizon_days_pk";--> statement-breakpoint
ALTER TABLE "app"."ingest_stage" ADD CONSTRAINT "ingest_stage_shop_id_upload_id_record_kind_source_row_pk" PRIMARY KEY("shop_id","upload_id","record_kind","source_row");--> statement-breakpoint
ALTER TABLE "app"."outcome" ADD CONSTRAINT "outcome_shop_id_recommendation_id_horizon_days_pk" PRIMARY KEY("shop_id","recommendation_id","horizon_days");--> statement-breakpoint
ALTER TABLE "app"."upload" ADD CONSTRAINT "upload_shop_id_unique" UNIQUE("shop_id","id");--> statement-breakpoint
ALTER TABLE "app"."sku" ADD CONSTRAINT "sku_shop_id_unique" UNIQUE("shop_id","id");--> statement-breakpoint
ALTER TABLE "app"."competitor_listing" ADD CONSTRAINT "competitor_listing_shop_id_unique" UNIQUE("shop_id","id");--> statement-breakpoint
ALTER TABLE "app"."recommendation" ADD CONSTRAINT "recommendation_shop_id_unique" UNIQUE("shop_id","id");--> statement-breakpoint
ALTER TABLE "app"."recommendation_run" ADD CONSTRAINT "recommendation_run_shop_id_unique" UNIQUE("shop_id","id");--> statement-breakpoint
ALTER TABLE "app"."ingest_stage" ADD CONSTRAINT "ingest_stage_upload_fk" FOREIGN KEY ("shop_id","upload_id") REFERENCES "app"."upload"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fee_line" ADD CONSTRAINT "fee_line_upload_fk" FOREIGN KEY ("shop_id","upload_id") REFERENCES "app"."upload"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fee_line" ADD CONSTRAINT "fee_line_sku_fk" FOREIGN KEY ("shop_id","sku_id") REFERENCES "app"."sku"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_line" ADD CONSTRAINT "order_line_upload_fk" FOREIGN KEY ("shop_id","upload_id") REFERENCES "app"."upload"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_line" ADD CONSTRAINT "order_line_sku_fk" FOREIGN KEY ("shop_id","sku_id") REFERENCES "app"."sku"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_traffic" ADD CONSTRAINT "product_traffic_upload_fk" FOREIGN KEY ("shop_id","upload_id") REFERENCES "app"."upload"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_traffic" ADD CONSTRAINT "product_traffic_sku_fk" FOREIGN KEY ("shop_id","sku_id") REFERENCES "app"."sku"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."competitor_listing" ADD CONSTRAINT "competitor_listing_sku_fk" FOREIGN KEY ("shop_id","sku_id") REFERENCES "app"."sku"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."competitor_observation" ADD CONSTRAINT "competitor_observation_listing_fk" FOREIGN KEY ("shop_id","listing_id") REFERENCES "app"."competitor_listing"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_snapshot" ADD CONSTRAINT "stock_snapshot_sku_fk" FOREIGN KEY ("shop_id","sku_id") REFERENCES "app"."sku"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."unit_cost" ADD CONSTRAINT "unit_cost_sku_fk" FOREIGN KEY ("shop_id","sku_id") REFERENCES "app"."sku"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."outcome" ADD CONSTRAINT "outcome_recommendation_fk" FOREIGN KEY ("shop_id","recommendation_id") REFERENCES "app"."recommendation"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."recommendation" ADD CONSTRAINT "recommendation_run_fk" FOREIGN KEY ("shop_id","run_id") REFERENCES "app"."recommendation_run"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."recommendation" ADD CONSTRAINT "recommendation_sku_fk" FOREIGN KEY ("shop_id","sku_id") REFERENCES "app"."sku"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sku_week_metric" ADD CONSTRAINT "sku_week_metric_sku_fk" FOREIGN KEY ("shop_id","sku_id") REFERENCES "app"."sku"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."job" ADD CONSTRAINT "job_shop_dedupe_unique" UNIQUE NULLS NOT DISTINCT("shop_id","dedupe_key");--> statement-breakpoint
ALTER TABLE "app"."shop" ADD CONSTRAINT "shop_salt_length_check" CHECK (octet_length("app"."shop"."order_hash_salt") >= 16);
