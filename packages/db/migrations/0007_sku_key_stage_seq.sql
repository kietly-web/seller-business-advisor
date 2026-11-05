ALTER TABLE "app"."ingest_stage" DROP CONSTRAINT "ingest_stage_kind_check";--> statement-breakpoint
ALTER TABLE "app"."ingest_stage" ADD COLUMN "seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."ingest_stage" DROP CONSTRAINT "ingest_stage_shop_id_upload_id_record_kind_source_row_pk";--> statement-breakpoint
ALTER TABLE "app"."ingest_stage" ADD CONSTRAINT "ingest_stage_shop_id_upload_id_record_kind_source_row_seq_pk" PRIMARY KEY("shop_id","upload_id","record_kind","source_row","seq");--> statement-breakpoint
ALTER TABLE "app"."sku" ADD COLUMN "sku_key" text;--> statement-breakpoint
ALTER TABLE "app"."sku" ADD CONSTRAINT "sku_shop_key_unique" UNIQUE("shop_id","sku_key");--> statement-breakpoint
ALTER TABLE "app"."ingest_stage" ADD CONSTRAINT "ingest_stage_kind_check" CHECK ("app"."ingest_stage"."record_kind" in ('order_line', 'fee_line', 'product_traffic', 'sku', 'stock', 'unit_cost'));
