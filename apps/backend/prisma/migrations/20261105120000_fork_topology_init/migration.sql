-- CreateTable
CREATE TABLE "account_default_projects" (
    "account_uuid" TEXT NOT NULL,
    "project_uuid" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_default_projects_pkey" PRIMARY KEY ("account_uuid")
);

-- CreateTable
CREATE TABLE "service_auto_projects" (
    "service_uuid" TEXT NOT NULL,
    "project_uuid" TEXT NOT NULL,
    "moved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_auto_projects_pkey" PRIMARY KEY ("service_uuid")
);

-- CreateTable
CREATE TABLE "topology_maps" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "preset" TEXT NOT NULL DEFAULT 'custom',
    "profile_uuid" TEXT,
    "project_uuid" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topology_maps_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "topology_nodes" (
    "uuid" TEXT NOT NULL,
    "map_uuid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'other',
    "label" TEXT,
    "service_uuid" TEXT,
    "remnawave_node_uuid" TEXT,
    "parent_uuid" TEXT,
    "addresses" JSONB NOT NULL DEFAULT '[]',
    "pos_x" DOUBLE PRECISION,
    "pos_y" DOUBLE PRECISION,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "ssh_host" TEXT,
    "ssh_port" INTEGER,
    "ssh_user" TEXT,
    "tabby_profile" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topology_nodes_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "topology_links" (
    "uuid" TEXT NOT NULL,
    "map_uuid" TEXT NOT NULL,
    "from_uuid" TEXT NOT NULL,
    "to_uuid" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'chain',
    "label" TEXT,
    "route" INTEGER,
    "protocol" TEXT,
    "animated" BOOLEAN NOT NULL DEFAULT true,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "source_key" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topology_links_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "topology_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "default_ssh_user" TEXT NOT NULL DEFAULT 'root',
    "default_ssh_port" INTEGER NOT NULL DEFAULT 22,
    "tabby_enabled" BOOLEAN NOT NULL DEFAULT true,
    "animate_edges" BOOLEAN NOT NULL DEFAULT true,
    "show_external" BOOLEAN NOT NULL DEFAULT true,
    "layout_direction" TEXT NOT NULL DEFAULT 'RIGHT',

    CONSTRAINT "topology_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topology_maps_project_uuid_idx" ON "topology_maps"("project_uuid");

-- CreateIndex
CREATE INDEX "topology_nodes_map_uuid_idx" ON "topology_nodes"("map_uuid");

-- CreateIndex
CREATE INDEX "topology_nodes_service_uuid_idx" ON "topology_nodes"("service_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "topology_nodes_map_remnawave_node_key" ON "topology_nodes"("map_uuid", "remnawave_node_uuid");

-- CreateIndex
CREATE INDEX "topology_links_from_uuid_idx" ON "topology_links"("from_uuid");

-- CreateIndex
CREATE INDEX "topology_links_to_uuid_idx" ON "topology_links"("to_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "topology_links_map_source_key_key" ON "topology_links"("map_uuid", "source_key");

-- AddForeignKey
ALTER TABLE "account_default_projects" ADD CONSTRAINT "account_default_projects_account_uuid_fkey" FOREIGN KEY ("account_uuid") REFERENCES "provider_accounts"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_default_projects" ADD CONSTRAINT "account_default_projects_project_uuid_fkey" FOREIGN KEY ("project_uuid") REFERENCES "projects"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_auto_projects" ADD CONSTRAINT "service_auto_projects_service_uuid_fkey" FOREIGN KEY ("service_uuid") REFERENCES "services"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topology_maps" ADD CONSTRAINT "topology_maps_project_uuid_fkey" FOREIGN KEY ("project_uuid") REFERENCES "projects"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topology_nodes" ADD CONSTRAINT "topology_nodes_map_uuid_fkey" FOREIGN KEY ("map_uuid") REFERENCES "topology_maps"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topology_nodes" ADD CONSTRAINT "topology_nodes_service_uuid_fkey" FOREIGN KEY ("service_uuid") REFERENCES "services"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topology_nodes" ADD CONSTRAINT "topology_nodes_parent_uuid_fkey" FOREIGN KEY ("parent_uuid") REFERENCES "topology_nodes"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topology_links" ADD CONSTRAINT "topology_links_map_uuid_fkey" FOREIGN KEY ("map_uuid") REFERENCES "topology_maps"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topology_links" ADD CONSTRAINT "topology_links_from_uuid_fkey" FOREIGN KEY ("from_uuid") REFERENCES "topology_nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topology_links" ADD CONSTRAINT "topology_links_to_uuid_fkey" FOREIGN KEY ("to_uuid") REFERENCES "topology_nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
