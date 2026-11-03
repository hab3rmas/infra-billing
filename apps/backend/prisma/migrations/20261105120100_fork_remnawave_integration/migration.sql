-- CreateTable
CREATE TABLE "remnawave_integrations" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "map_uuid" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "base_url" TEXT NOT NULL,
    "token_enc" BYTEA,
    "extra_headers_enc" BYTEA,
    "subscription_url" TEXT,
    "panel_service_uuid" TEXT,
    "sub_service_uuid" TEXT,
    "auto_sync" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "last_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remnawave_integrations_pkey" PRIMARY KEY ("uuid")
);

-- AddForeignKey
ALTER TABLE "remnawave_integrations" ADD CONSTRAINT "remnawave_integrations_map_uuid_fkey" FOREIGN KEY ("map_uuid") REFERENCES "topology_maps"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
