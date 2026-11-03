-- CreateTable
CREATE TABLE "profiles" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon_name" TEXT,
    "icon_bg" TEXT,
    "favicon_link" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "default_project_uuid" TEXT,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "telegram_chat_id" TEXT,
    "telegram_topic_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "profile_projects" (
    "project_uuid" TEXT NOT NULL,
    "profile_uuid" TEXT NOT NULL,

    CONSTRAINT "profile_projects_pkey" PRIMARY KEY ("project_uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_slug_key" ON "profiles"("slug");

-- CreateIndex
CREATE INDEX "profile_projects_profile_uuid_idx" ON "profile_projects"("profile_uuid");

-- AddForeignKey
ALTER TABLE "profile_projects" ADD CONSTRAINT "profile_projects_project_uuid_fkey" FOREIGN KEY ("project_uuid") REFERENCES "projects"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_projects" ADD CONSTRAINT "profile_projects_profile_uuid_fkey" FOREIGN KEY ("profile_uuid") REFERENCES "profiles"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topology_maps" ADD CONSTRAINT "topology_maps_profile_uuid_fkey" FOREIGN KEY ("profile_uuid") REFERENCES "profiles"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

